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
			searchNotes: { params: { query: string }; response: Note[] };
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
const searchInput = document.getElementById("search-input") as HTMLInputElement;
const noteList = document.getElementById("note-list") as HTMLDivElement;
const statsDiv = document.getElementById("stats") as HTMLDivElement;

const emptyEditor = document.getElementById("empty-editor") as HTMLDivElement;
const editorContainer = document.getElementById("editor-container") as HTMLDivElement;
const noteTitleInput = document.getElementById("note-title") as HTMLInputElement;
const noteContentTextarea = document.getElementById("note-content") as HTMLTextAreaElement;
const deleteBtn = document.getElementById("delete-btn") as HTMLButtonElement;

let notes: Note[] = [];
let activeNote: Note | null = null;
let saveTimeout: number | null = null;
let searchTimeout: number | null = null;

async function loadNotes() {
	const query = searchInput.value.trim();
	if (query === "") {
		notes = await electrobun.rpc!.request.getNotes({});
	} else {
		notes = await electrobun.rpc!.request.searchNotes({ query });
	}

	// Sort by updated_at descending visually
	notes.sort((a, b) => new Date(b.updated_at + "Z").getTime() - new Date(a.updated_at + "Z").getTime());

	renderNotes();
	updateStats();
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
			const isActive = activeNote && note.id === activeNote.id ? "active" : "";

			return `
				<div class="note-item ${isActive}" data-id="${note.id}">
					<div class="note-item-title">${escapeHtml(displayTitle)}</div>
					<div class="note-item-preview">${escapeHtml(preview) || "No additional text"}</div>
					<div class="note-item-date">${dateStr}</div>
					<button class="delete-note-btn" title="Delete Memo" data-id="${note.id}">
						<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				</div>
			`;
		})
		.join("");

	// Attach selection listeners
	noteList.querySelectorAll(".note-item").forEach((item) => {
		item.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			const deleteBtn = target.closest(".delete-note-btn");
			if (deleteBtn) {
				e.stopPropagation();
				const id = parseInt((deleteBtn as HTMLElement).dataset['id']!);
				deleteNoteById(id);
				return;
			}
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
	if (activeNote?.id === id) return;

	// Flush pending saves for the previous note immediately
	flushSave();

	const note = notes.find(n => n.id === id);
	if (!note) return;

	activeNote = { ...note };

	// Update UI state
	renderNotes(); // re-render to highlight active

	emptyEditor.classList.add("hidden");
	editorContainer.classList.remove("hidden");

	noteTitleInput.value = activeNote.title;
	noteContentTextarea.value = activeNote.content;
	noteContentTextarea.focus();
}

function clearSelection() {
	activeNote = null;
	renderNotes();
	emptyEditor.classList.remove("hidden");
	editorContainer.classList.add("hidden");
	noteTitleInput.value = "";
	noteContentTextarea.value = "";
}

async function createNewNote() {
	flushSave(); // Save any currently active note before creating a new one

	searchInput.value = ""; // Clear search so new note is visible

	// Default new note
	const newNote = await electrobun.rpc!.request.addNote({ title: "", content: "" });
	await loadNotes();
	selectNote(newNote.id);
	noteTitleInput.focus();
}

// Search Logic
function handleSearch() {
	if (searchTimeout) {
		clearTimeout(searchTimeout);
	}

	searchTimeout = window.setTimeout(async () => {
		await loadNotes();
	}, 300);
}

// Auto-save debouncing
function triggerAutoSave() {
	if (!activeNote) return;

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
	if (!activeNote) return;

	const newTitle = noteTitleInput.value;
	const newContent = noteContentTextarea.value;

	// Only save if changed
	if (activeNote.title !== newTitle || activeNote.content !== newContent) {
		// Optimistically update local state
		activeNote.title = newTitle;
		activeNote.content = newContent;
		const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
		activeNote.updated_at = nowStr; // rough approximation for immediate UI update

		await electrobun.rpc!.request.updateNote({
			id: activeNote.id,
			title: newTitle,
			content: newContent
		});

		// Reload pure state and resort the list
		await loadNotes();
	}
}

async function deleteActiveNote() {
	if (!activeNote) return;

	await deleteNoteById(activeNote.id);
}

async function deleteNoteById(id: number) {
	await electrobun.rpc!.request.deleteNote({ id });
	if (activeNote?.id === id) {
		clearSelection();
	}
	await loadNotes();
}

// Event Listeners
addBtn.addEventListener("click", createNewNote);
searchInput.addEventListener("input", handleSearch);

noteTitleInput.addEventListener("input", triggerAutoSave);
noteContentTextarea.addEventListener("input", triggerAutoSave);

// Flush when hiding or switching
noteTitleInput.addEventListener("blur", flushSave);
noteContentTextarea.addEventListener("blur", flushSave);

deleteBtn.addEventListener("click", deleteActiveNote);

// Initialize
loadNotes();
