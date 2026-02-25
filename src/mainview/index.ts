import Electrobun, { Electroview } from "electrobun/view";

type Note = {
	id: number;
	title: string;
	content: string;
	created_at: string;
	updated_at: string;
};

type NoteRPC = {
	bun: {
		requests: {
			getNotes: { params: {}; response: Note[] };
			addNote: { params: { title: string; content: string }; response: Note };
			updateNote: { params: { id: number; title: string; content: string }; response: Note };
			deleteNote: { params: { id: number }; response: { success: boolean } };
			getStats: { params: {}; response: { total: number } };
		};
		messages: {};
	};
	webview: {
		requests: {};
		messages: {};
	};
};

const rpc = Electroview.defineRPC<NoteRPC>({
	maxRequestTime: 5000,
	handlers: { requests: {}, messages: {} },
});

const electrobun = new Electrobun.Electroview({ rpc });

// DOM Elements
const addBtn = document.getElementById("add-btn") as HTMLButtonElement;
const noteList = document.getElementById("note-list") as HTMLDivElement;
const statsDiv = document.getElementById("stats") as HTMLDivElement;

const emptyEditor = document.getElementById("empty-editor") as HTMLDivElement;
const editorContainer = document.getElementById("editor-container") as HTMLDivElement;
const noteTitleInput = document.getElementById("note-title") as HTMLInputElement;
const noteContentTextarea = document.getElementById("note-content") as HTMLTextAreaElement;
const deleteBtn = document.getElementById("delete-btn") as HTMLButtonElement;

let notes: Note[] = [];
let activeNoteId: number | null = null;
let saveTimeout: number | null = null;

async function loadNotes() {
	notes = await electrobun.rpc!.request.getNotes({});
	// Sort by updated_at descending visually
	notes.sort((a, b) => new Date(b.updated_at + "Z").getTime() - new Date(a.updated_at + "Z").getTime());

	renderNotes();
	updateStats();

	// If the active note was deleted by another process (unlikely but possible), clear selection
	if (activeNoteId && !notes.find(n => n.id === activeNoteId)) {
		clearSelection();
	} else if (activeNoteId) {
		// Update selection visually
		renderNotes();
	}
}

function renderNotes() {
	if (notes.length === 0) {
		noteList.innerHTML = '<div class="empty-state">No memos yet. Click + to create one.</div>';
		return;
	}

	noteList.innerHTML = notes
		.map((note) => {
			const date = new Date(note.updated_at + "Z");
			const isToday = new Date().toDateString() === date.toDateString();
			const dateStr = isToday
				? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
				: date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

			// Extract a preview from content, falling back to empty
			const rawContent = note.content.replace(/\s+/g, " ").trim();
			const preview = rawContent.length > 60 ? rawContent.substring(0, 60) + "..." : rawContent;
			const displayTitle = note.title.trim() || "New Memo";
			const isActive = note.id === activeNoteId ? "active" : "";

			return `
				<div class="note-item ${isActive}" data-id="${note.id}">
					<div class="note-item-title">${escapeHtml(displayTitle)}</div>
					<div class="note-item-preview">${escapeHtml(preview) || "No additional text"}</div>
					<div class="note-item-date">${dateStr}</div>
				</div>
			`;
		})
		.join("");

	// Attach selection listeners
	noteList.querySelectorAll(".note-item").forEach((item) => {
		item.addEventListener("click", () => {
			const id = parseInt((item as HTMLElement).dataset['id']!);
			selectNote(id);
		});
	});
}

async function updateStats() {
	const stats = await electrobun.rpc!.request.getStats({});
	statsDiv.textContent = `${stats.total} memo${stats.total !== 1 ? "s" : ""}`;
}

function escapeHtml(str: string): string {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

// Editor Logic
function selectNote(id: number) {
	// If we are selecting the exact same note, do nothing
	if (activeNoteId === id) return;

	// Flush pending saves for the previous note immediately
	flushSave();

	const note = notes.find(n => n.id === id);
	if (!note) return;

	activeNoteId = id;

	// Update UI state
	renderNotes(); // re-render to highlight active

	emptyEditor.classList.add("hidden");
	editorContainer.classList.remove("hidden");

	noteTitleInput.value = note.title;
	noteContentTextarea.value = note.content;
	noteContentTextarea.focus();
}

function clearSelection() {
	activeNoteId = null;
	renderNotes();
	emptyEditor.classList.remove("hidden");
	editorContainer.classList.add("hidden");
	noteTitleInput.value = "";
	noteContentTextarea.value = "";
}

async function createNewNote() {
	flushSave(); // Save any currently active note before creating a new one

	// Default new note
	const newNote = await electrobun.rpc!.request.addNote({ title: "", content: "" });
	await loadNotes();
	selectNote(newNote.id);
	noteTitleInput.focus();
}

// Auto-save debouncing
function triggerAutoSave() {
	if (!activeNoteId) return;

	if (saveTimeout) {
		clearTimeout(saveTimeout);
	}

	// Debounce for 500ms
	saveTimeout = window.setTimeout(() => {
		performSave();
	}, 500);
}

// Immediate save (used on blur or selection change)
function flushSave() {
	if (saveTimeout) {
		clearTimeout(saveTimeout);
		saveTimeout = null;
		performSave();
	}
}

async function performSave() {
	if (!activeNoteId) return;

	const note = notes.find(n => n.id === activeNoteId);
	if (!note) return;

	const newTitle = noteTitleInput.value;
	const newContent = noteContentTextarea.value;

	// Only save if changed
	if (note.title !== newTitle || note.content !== newContent) {
		// Optimistically update local state
		note.title = newTitle;
		note.content = newContent;
		const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
		note.updated_at = nowStr; // rough approximation for immediate UI update

		await electrobun.rpc!.request.updateNote({
			id: activeNoteId,
			title: newTitle,
			content: newContent
		});

		// Reload pure state and resort the list
		await loadNotes();
	}
}

async function deleteActiveNote() {
	if (!activeNoteId) return;

	await electrobun.rpc!.request.deleteNote({ id: activeNoteId });
	clearSelection();
	await loadNotes();
}

// Event Listeners
addBtn.addEventListener("click", createNewNote);

noteTitleInput.addEventListener("input", triggerAutoSave);
noteContentTextarea.addEventListener("input", triggerAutoSave);

// Flush when hiding or switching
noteTitleInput.addEventListener("blur", flushSave);
noteContentTextarea.addEventListener("blur", flushSave);

deleteBtn.addEventListener("click", deleteActiveNote);

// Initialize
loadNotes();
