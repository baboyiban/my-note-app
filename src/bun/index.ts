import { BrowserView, BrowserWindow, Utils, type RPCSchema } from "electrobun/bun";
import Database from "bun:sqlite";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

// Ensure data directory exists
const dataDir = Utils.paths.userData;
if (!existsSync(dataDir)) {
	mkdirSync(dataDir, { recursive: true });
}

// Initialize SQLite database
const dbPath = join(dataDir, "notes.db");
const db = new Database(dbPath, { create: true });

// Create table
db.exec(`
	CREATE TABLE IF NOT EXISTS notes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		content TEXT NOT NULL DEFAULT '',
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		updated_at TEXT NOT NULL DEFAULT (datetime('now'))
	)
`);

// Prepared statements
const getAllNotes = db.prepare("SELECT * FROM notes ORDER BY created_at DESC");
const getNoteById = db.prepare("SELECT * FROM notes WHERE id = ?");
const insertNote = db.prepare("INSERT INTO notes (title, content) VALUES (?, ?) RETURNING *");
const updateNote = db.prepare("UPDATE notes SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ? RETURNING *");
const deleteNote = db.prepare("DELETE FROM notes WHERE id = ?");
const getStats = db.prepare("SELECT COUNT(*) as total FROM notes");
const searchNotesStmt = db.prepare("SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC");

type Note = {
	id: number;
	title: string;
	content: string;
	created_at: string;
	updated_at: string;
};

type Stats = {
	total: number;
};

type NoteRPC = {
	bun: RPCSchema<{
		requests: {
			getNotes: {
				params: {};
				response: Note[];
			};
			addNote: {
				params: { title: string; content: string };
				response: Note;
			};
			updateNote: {
				params: { id: number; title: string; content: string };
				response: Note;
			};
			deleteNote: {
				params: { id: number };
				response: { success: boolean };
			};
			getStats: {
				params: {};
				response: Stats;
			};
			searchNotes: {
				params: { query: string };
				response: Note[];
			};
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {};
	}>;
};

const noteRPC = BrowserView.defineRPC<NoteRPC>({
	maxRequestTime: 5000,
	handlers: {
		requests: {
			getNotes: () => {
				return getAllNotes.all() as Note[];
			},
			addNote: ({ title, content }) => {
				return insertNote.get(title, content) as Note;
			},
			updateNote: ({ id, title, content }) => {
				return updateNote.get(title, content, id) as Note;
			},
			deleteNote: ({ id }) => {
				deleteNote.run(id);
				return { success: true };
			},
			getStats: () => {
				const row = getStats.get() as any;
				return { total: row.total };
			},
			searchNotes: ({ query }) => {
				const q = "%" + query + "%";
				return searchNotesStmt.all(q, q) as Note[];
			},
		},
		messages: {},
	},
});

const mainWindow = new BrowserWindow({
	title: "Note App",
	url: "views://mainview/index.html",
	rpc: noteRPC,
	frame: {
		width: 800,
		height: 700,
		x: 200,
		y: 200,
	},
});

console.log("SQLite Note app started!");
console.log(`Database: ${dbPath}`);
