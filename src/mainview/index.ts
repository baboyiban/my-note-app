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

// DOM
const noteInput = document.getElementById("new-note") as HTMLInputElement;
const addBtn = document.getElementById("add-btn") as HTMLButtonElement;
const noteList = document.getElementById("note-list") as HTMLDivElement;
const statsDiv = document.getElementById("stats") as HTMLDivElement;

let notes: Note[] = [];

// Modal elements
let modalOverlay: HTMLDivElement;
let modalTitleInput: HTMLInputElement;
let modalContentTextarea: HTMLTextAreaElement;
let saveBtn: HTMLButtonElement;
let cancelBtn: HTMLButtonElement;
let currentEditId: number | null = null;

function createModal() {
	modalOverlay = document.createElement("div");
	modalOverlay.className = "modal-overlay hidden";
	modalOverlay.innerHTML = `
		<div class="modal">
			<div class="modal-header">
				<h2 id="modal-title">Edit Note</h2>
				<button class="close-btn">&times;</button>
			</div>
			<div class="modal-body">
				<input type="text" id="modal-title-input" placeholder="Note title" />
				<textarea id="modal-content" placeholder="Write your note content..."></textarea>
			</div>
			<div class="modal-footer">
				<button class="cancel-btn">Cancel</button>
				<button class="save-btn">Save</button>
			</div>
		</div>
	`;
	document.body.appendChild(modalOverlay);

	modalTitleInput = document.getElementById("modal-title-input") as HTMLInputElement;
	modalContentTextarea = document.getElementById("modal-content") as HTMLTextAreaElement;
	saveBtn = modalOverlay.querySelector(".save-btn") as HTMLButtonElement;
	cancelBtn = modalOverlay.querySelector(".cancel-btn") as HTMLButtonElement;
	const closeBtn = modalOverlay.querySelector(".close-btn") as HTMLButtonElement;

	// Event listeners
	modalOverlay.addEventListener("click", (e) => {
		if (e.target === modalOverlay) closeModal();
	});
	closeBtn.addEventListener("click", closeModal);
	cancelBtn.addEventListener("click", closeModal);
	saveBtn.addEventListener("click", saveNote);

	// Keyboard shortcuts
	document.addEventListener("keydown", (e) => {
		if (!modalOverlay.classList.contains("hidden")) {
			if (e.key === "Escape") closeModal();
			if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				saveNote();
			}
		}
	});
}

function openModal(note?: Note) {
	if (note) {
		currentEditId = note.id;
		modalTitleInput.value = note.title;
		modalContentTextarea.value = note.content;
		document.getElementById("modal-title")!.textContent = "Edit Note";
	} else {
		currentEditId = null;
		modalTitleInput.value = "";
		modalContentTextarea.value = "";
		document.getElementById("modal-title")!.textContent = "New Note";
	}
	modalOverlay.classList.remove("hidden");
	modalTitleInput.focus();
}

function closeModal() {
	modalOverlay.classList.add("hidden");
	currentEditId = null;
}

async function saveNote() {
	const title = modalTitleInput.value.trim() || "Untitled";
	const content = modalContentTextarea.value;

	if (currentEditId) {
		await electrobun.rpc!.request.updateNote({ id: currentEditId, title, content });
	} else {
		await electrobun.rpc!.request.addNote({ title, content });
	}

	closeModal();
	await loadNotes();
}

async function loadNotes() {
	notes = await electrobun.rpc!.request.getNotes({});
	renderNotes();
	updateStats();
}

function renderNotes() {
	if (notes.length === 0) {
		noteList.innerHTML = '<div class="empty-state">No notes yet. Click "Add Note" to create one!</div>';
		return;
	}

	noteList.innerHTML = notes
		.map((note) => {
			const date = new Date(note.created_at + "Z");
			const dateStr = date.toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			});
			const preview = note.content.length > 100 ? note.content.substring(0, 100) + "..." : note.content;
			return `
				<div class="note-card" data-id="${note.id}">
					<button class="delete-btn" data-id="${note.id}">&times;</button>
					<div class="note-title">${escapeHtml(note.title)}</div>
					<div class="note-content">${escapeHtml(preview) || "(Empty note)"}</div>
					<div class="note-date">${dateStr}</div>
				</div>
			`;
		})
		.join("");

	// Attach event listeners
	noteList.querySelectorAll(".note-card").forEach((card) => {
		card.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			if (!target.classList.contains("delete-btn")) {
				const id = parseInt((card as HTMLElement).dataset.id!);
				const note = notes.find((n) => n.id === id);
				if (note) openModal(note);
			}
		});
	});

	noteList.querySelectorAll(".delete-btn").forEach((btn) => {
		btn.addEventListener("click", async (e) => {
			e.stopPropagation();
			const id = parseInt((btn as HTMLElement).dataset.id!);
			if (true) {
				await electrobun.rpc!.request.deleteNote({ id });
				await loadNotes();
			}
		});
	});
}

async function updateStats() {
	const stats = await electrobun.rpc!.request.getStats({});
	statsDiv.textContent = `${stats.total} note${stats.total !== 1 ? "s" : ""}`;
}

function escapeHtml(str: string): string {
	const div = document.createElement("div");
	div.textContent = str;
	return div.innerHTML;
}

// Add note
async function addNote() {
	const title = noteInput.value.trim();
	if (!title) {
		noteInput.focus();
		return;
	}
	await electrobun.rpc!.request.addNote({ title, content: "" });
	noteInput.value = "";
	await loadNotes();
}

addBtn.addEventListener("click", addNote);
noteInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") addNote();
});

// Initialize
createModal();
loadNotes();
