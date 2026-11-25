// Key tips, as in Excel: tap Alt and every clickable thing in view gets a letter; type it to
// click. Esc, a click, a scroll or another Alt tap puts them away. Alt held with another key
// (Alt+Tab, Desk's own Alt shortcuts) never shows them. Not on touch screens: no keyboard.
// Works on plain Desk and with techountant_theme (its rail gets the workspace numbers).

// Never takes Desk down with it: see attempt() below.
// For one browser: localStorage "keytips-off" = "1".
let broken = false;
const off = (() => {
	try {
		return localStorage.getItem("keytips-off") === "1";
	} catch (e) {
		return false;
	}
})();
// A throw in one step is said once and that step skipped; a throw while setting up turns the
// whole thing off, since nothing would work half-wired.
const said = new Set();
function attempt(part, where, fn) {
	if (broken || off) return undefined;
	try {
		return fn();
	} catch (e) {
		if (where === "setup_keytips") broken = true;
		try {
			hide();
		} catch (x) {
			// nothing up yet
		}
		if (!said.has(where)) {
			said.add(where);
			console.error(`[keytips] failed in ${where}${broken ? "; off until the page reloads" : ""}`, e);
		}
		return undefined;
	}
}

const TARGETS = [
	"a[href]",
	"button",
	"[role=button]",
	"[role=tab]",
	"[role=menuitem]",
	"[role=option]",
	"select",
	"textarea",
	"input:not([type=hidden])",
	"[data-label]",
	".btn",
	".list-row",
	".shortcut-widget-box",
	".section-head.collapsible",
].join(",");
const ALPHABET = "asdfghjklqwertyuiopzxcvbnm";
// The common ones keep the same letter on every page, so fingers learn them.
const FIXED = [
	["s", "header.navbar .search-bar input"],
	["a", ".page-head .primary-action, .page-head .page-actions .btn-primary"],
	["b", "header.navbar .notifications-icon"],
	["t", "header.navbar .ts-badge-link"],
	["h", "header.navbar .dropdown-help > .nav-link, header.navbar .dropdown-help > button"],
	["u", "header.navbar .dropdown-navbar-user > .nav-link, header.navbar .dropdown-navbar-user > button"],
	["v", ".page-head button:has(use[href='#icon-list']), .page-head button:has(use[href='#icon-table']), .page-head button:has(use[href='#icon-kanban'])"],
	["r", ".page-head button:has(use[href*='reload']), .page-head button:has(use[href='#icon-refresh'])"],
	["m", ".page-head .menu-btn-group > button"],
	["p", ".page-head button:has(use[href='#icon-printer'])"],
];
// letters above stay out of a form's field keys (RESERVED in keytips/api.py)

// A form's own keys, shared by everyone on the site (keytips/api.py), by doctype.
const form_keys = {};
function current_form() {
	const route = frappe.get_route() || [];
	const frm = window.cur_frm;
	if (route[0] !== "Form" || !frm || frm.doctype !== route[1] || frm.is_new === undefined) return null;
	return frm;
}
function load_form_keys() {
	const frm = current_form();
	if (!frm || frm.doctype in form_keys) return;
	form_keys[frm.doctype] = null;
	frappe
		.xcall("keytips.api.get_keys", { doctype: frm.doctype })
		.then((keys) => (form_keys[frm.doctype] = keys || {}))
		.catch(() => delete form_keys[frm.doctype]);
}
// A table's key lands in its first empty row, ready to type, or adds a row when none is empty.
// "Empty": the first column shown in the grid has no value.
function into_table(frm, field) {
	// not frm.scroll_to_field: for a table it focuses every input in the grid in turn, and the
	// cursor visibly runs along the row (item, uom, qty, rate...) before settling
	const wrapper = field.$wrapper && field.$wrapper[0];
	const tab = (frm.layout.tabs || []).find((t) => t.wrapper && wrapper && t.wrapper[0] && t.wrapper[0].contains(wrapper));
	if (tab && !tab.is_active?.()) tab.set_active();
	if (wrapper) wrapper.scrollIntoView({ block: "center" });
	const grid = field.grid;
	if (!grid) return;
	const first = (grid.visible_columns || []).map((c) => c[0] && c[0].fieldname).find(Boolean);
	let row = (grid.grid_rows || []).find((r) => first && r.doc && !r.doc[first]);
	if (!row) {
		if (!grid.is_editable || !grid.is_editable() || grid.df.read_only || frm.doc.docstatus !== 0) return;
		grid.add_new_row(null, null, true);
		row = grid.grid_rows[grid.grid_rows.length - 1];
	}
	if (!row || !row.row) return;
	setTimeout(() => {
		const cell = row.row[0].querySelector(`.grid-static-col[data-fieldname="${first}"]`) || row.row[0].querySelector(".grid-static-col");
		if (cell) cell.click();
		setTimeout(() => {
			// the click may have opened something of the site's own (omran's Find Item box, a
			// dialog) that took the cursor: leave it there, or the grid row and that box fight
			// over it and the cursor runs along the row to Rate
			const active = document.activeElement;
			const elsewhere =
				active && active !== document.body && !row.row[0].contains(active) && active.matches("input, textarea, select, [contenteditable]");
			if (elsewhere || document.querySelector(".modal.show")) return;
			const input = row.row[0].querySelector(`[data-fieldname="${first}"] input, [data-fieldname="${first}"] select`);
			if (input && active !== input) input.focus();
		}, 120);
	}, 80);
}

// Lists and workspaces: what they show is drawn in the browser, so the browser names the items
// ([id, label], the important ones first) and the server gives the new ones keys, once, for all.
const page_keys = {};
const asked = {};
function current_page() {
	const route = frappe.get_route() || [];
	if (route[0] === "List" && route[1] && window.cur_list && cur_list.doctype === route[1]) {
		const root = cur_list.page && cur_list.page.wrapper && cur_list.page.wrapper[0];
		return root ? { id: "list:" + route[1], root, kind: "list" } : null;
	}
	if (route[0] === "query-report" && route[1] && frappe.query_report && frappe.query_report.report_name === route[1]) {
		const root = frappe.query_report.page && frappe.query_report.page.wrapper && frappe.query_report.page.wrapper[0];
		return root ? { id: "report:" + route[1], root, kind: "report" } : null;
	}
	if (route[0] === "Workspaces" && route.length > 1) {
		const name = route[route.length - 1];
		const root = document.querySelector(".layout-main-section .editor-js-container, .layout-main-section");
		return root ? { id: "workspace:" + name, root, kind: "workspace" } : null;
	}
	return null;
}
const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
function page_items(page) {
	const out = [];
	const add = (id, label, el) => {
		if (id && label && el && !out.some((o) => o.id === id)) out.push({ id, label, el });
	};
	const q = (sel) => [...page.root.querySelectorAll(sel)];
	if (page.kind === "list") {
		for (const c of q(".page-form .frappe-control[data-fieldname]")) {
			const input = c.querySelector("input, select");
			const label = (input && input.getAttribute("placeholder")) || c.dataset.fieldname.replace(/_/g, " ");
			add("filter:" + c.dataset.fieldname, label, input || c);
		}
		for (const b of q(".tt-status-tabs button[role=tab]")) {
			const count = b.querySelector(".tt-tab-count");
			add("tab:" + b.dataset.value, text(b).replace(count ? text(count) : "", "").trim(), b);
		}
		for (const b of q(".tt-status-tabs .tt-tab-mine")) add("mine", __("Mine"), b);
		for (const b of q(".filter-selector .filter-button")) add("filters", "Filters", b);
		for (const b of q(".sort-selector .btn-order")) add("order", "Order", b);
		for (const b of q(".sort-selector .sort-selector-button, .sort-selector .dropdown-toggle")) add("sort", "Sort by", b);
	} else if (page.kind === "report") {
		// the report's filters, then each column's filter (Alt then Down goes into the rows)
		for (const c of q(".page-form .frappe-control[data-fieldname]")) {
			const input = c.querySelector("input, select");
			const label = (input && input.getAttribute("placeholder")) || c.dataset.fieldname.replace(/_/g, " ");
			add("filter:" + c.dataset.fieldname, label, input || c);
		}
		const heads = q(".dt-header .dt-row-header .dt-cell");
		for (const f of q(".dt-row-filter .dt-cell")) {
			const col = f.dataset.colIndex;
			const head = heads.find((h) => h.dataset.colIndex === col);
			const input = f.querySelector("input");
			if (input && head && text(head)) add("column:" + text(head), text(head), input);
		}
	} else {
		for (const w of q(".shortcut-widget-box")) {
			const t = w.querySelector(".widget-title");
			if (t) add("shortcut:" + text(t), text(t), w);
		}
		for (const a of q(".links-widget-box a.link-item")) add("link:" + text(a), text(a), a);
	}
	return out;
}
function load_page_keys() {
	const page = current_page();
	if (!page) return;
	const items = page_items(page);
	const keys = page_keys[page.id];
	const fresh = items.filter((it) => !keys || !(it.id in keys));
	if (!fresh.length || asked[page.id]) return;
	asked[page.id] = true;
	frappe
		.xcall("keytips.api.get_page_keys", { page: page.id, items: items.map((it) => [it.id, it.label]) })
		.then((k) => {
			page_keys[page.id] = k || {};
			// tips already up without these keys (Alt came first): draw them again with them
			if (layer && !editing) attempt("keytips", "show", () => (hide(), show()));
		})
		.finally(() => delete asked[page.id]);
}
function page_targets(page) {
	const keys = page_keys[page.id] || {};
	return page_items(page)
		.filter((it) => it.id in keys)
		.map((it) => ({ el: it.el, code: keys[it.id], go: it.go, r: visible(it.el), map: page.id, id: it.id, label: it.label }));
}

// A report's grid: one key lands on its first row; arrows move (Desk's grid does that), Enter
// opens the link in the cell, Esc leaves the grid.
function into_grid(root) {
	const cell = root.querySelector(".dt-scrollable .dt-row:not(.dt-row-filter) .dt-cell:not(.dt-cell--col-0)");
	if (!cell) return;
	cell.scrollIntoView({ block: "nearest" });
	const dt = frappe.query_report && frappe.query_report.datatable;
	// the grid's own focus, so its own arrow keys pick up from here
	try {
		dt.cellmanager.focusCell(cell);
	} catch (e) {
		// a grid that changed under us: plain focus still gets Enter and Esc
		cell.focus();
	}
}
function into_rows() {
	const page = current_page();
	if (!page) return;
	if (page.kind === "report") return into_grid(page.root);
	if (page.kind === "list") {
		const row = page.root.querySelector(".result .list-row-container");
		if (row) {
			row.focus();
			row.scrollIntoView({ block: "nearest" });
		}
	}
}
function on_grid_key(e) {
	if (layer || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
	const cell = document.activeElement;
	if (!cell || !cell.classList || !cell.classList.contains("dt-cell") || !cell.closest(".dt-scrollable")) return;
	if (cell.classList.contains("dt-cell--editing")) return;
	if (e.key === "Enter") {
		const link = cell.querySelector("a[href]");
		if (!link) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		link.click();
	} else if (e.key === "Escape") {
		e.preventDefault();
		e.stopImmediatePropagation();
		cell.blur();
	}
}

// every key of the form, on screen or not: one that is off screen still jumps to its field
function form_targets(frm) {
	const keys = form_keys[frm.doctype];
	if (!keys) return [];
	const out = [];
	for (const [fieldname, code] of Object.entries(keys)) {
		const tab = (frm.layout.tabs || []).find((t) => t.df && t.df.fieldname === fieldname);
		const field = frm.fields_dict[fieldname];
		let el;
		let go;
		if (field && field.df && field.df.fieldtype === "Section Break") {
			// a collapsible section: open it and bring it into view
			if (!field.head || !field.head[0] || field.df.hidden || field.wrapper.hasClass("hide-control")) continue;
			el = field.head[0];
			go = () => {
				const tab = (frm.layout.tabs || []).find((t) => t.wrapper && t.wrapper[0] && t.wrapper[0].contains(el));
				if (tab && !tab.is_active?.()) tab.set_active();
				if (field.is_collapsed && field.is_collapsed()) field.collapse(false);
				el.scrollIntoView({ block: "start", behavior: "smooth" });
			};
		} else if (tab) {
			if (!tab.tab_link || tab.tab_link.hasClass("hide")) continue;
			el = tab.tab_link[0].querySelector(".nav-link") || tab.tab_link[0];
			go = () => tab.set_active();
		} else {
			if (!field || !field.df || field.df.hidden) continue;
			if (!field.$wrapper || field.$wrapper.is(":hidden") && !field.$wrapper.closest(".tab-pane, .section-body").length) continue;
			el = field.$wrapper[0];
			go = field.df.fieldtype === "Table" ? () => into_table(frm, field) : () => frm.scroll_to_field(fieldname);
		}
		out.push({ el, code, go, map: frm.doctype, id: fieldname, label: (tab ? tab.df : field.df).label || fieldname, r: el && visible(el.querySelector(".control-label, label, .grid-heading-row") || el) });
	}
	return out;
}

let armed = false;
let layer = null;
let tips = [];
let typed = "";
// edit mode: a System Manager taps = while the tips are up, then picks a key (type it or click it)
// to give that item another one; only the stored keys (form fields, list/workspace items) change
let editing = false;
const can_edit = () => (frappe.user_roles || []).includes("System Manager");
function start_editing() {
	editing = true;
	layer.classList.add("tt-edit");
	const note = document.createElement("div");
	note.className = "tt-edit-note";
	note.textContent = __("Edit keys: type or click a key to change it. Esc to stop.");
	layer.appendChild(note);
	for (const t of tips) {
		if (!t.tip) continue;
		if (!t.map) {
			t.tip.dataset.fixed = 1;
			continue;
		}
		t.tip.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			attempt("keytips", "edit", () => edit_tip(t));
		});
	}
}
function edit_tip(t) {
	hide();
	const name = t.label || t.id;
	const saved = (r, msg) => {
		if (t.map.includes(":")) page_keys[t.map] = r.keys || {};
		else form_keys[t.map] = r.keys || {};
		frappe.show_alert({ message: msg, indicator: "green" });
	};
	const save = (key, swap) =>
		frappe.xcall("keytips.api.set_key", { page: t.map, item: t.id, key, swap: swap ? 1 : 0 }).then((r) => {
			if (!r) return;
			if (r.taken) {
				const K = key.toUpperCase();
				const O = r.taken.old.toUpperCase();
				frappe.confirm(
					__("{0} is already {1}'s key. Swap them? {2} becomes {0}, {1} becomes {3}.", [
						`<b>${K}</b>`,
						frappe.utils.escape_html(r.taken.label),
						frappe.utils.escape_html(name),
						`<b>${O}</b>`,
					]),
					() => save(key, true).then(() => {})
				);
				return;
			}
			saved(r, swap ? __("Swapped: {0} is now {1}", [name, key.toUpperCase()]) : __("{0} is now {1}", [name, key.toUpperCase()]));
		});
	frappe.prompt(
		{
			fieldname: "key",
			fieldtype: "Data",
			label: __("Key for {0}", [name]),
			default: t.code.toUpperCase(),
			reqd: 1,
			description: __("One or two characters, a letter first. If another item has it, you can swap."),
		},
		(v) => save(v.key.trim().toLowerCase(), false),
		__("Change key")
	);
}

function visible(el) {
	const r = el.getBoundingClientRect();
	if (r.width < 4 || r.height < 4) return null;
	if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return null;
	if (el.disabled || el.closest("[aria-hidden=true], .hidden, .hide")) return null;
	const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
	const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
	const hit = document.elementFromPoint(x, y);
	if (!hit || !(el === hit || el.contains(hit) || hit.contains(el))) return null;
	return r;
}

function label_of(el) {
	return (el.getAttribute("aria-label") || el.title || el.innerText || el.value || el.placeholder || "")
		.trim()
		.toLowerCase();
}

// As many single letters as fit; the letters left over start two-letter codes for the rest.
// k singles + (26 - k) prefixes x 26 must cover every item. Singles go to items in order, so
// the page's own buttons (sorted first in show) get one key; the rail gets two.
function codes_for(items, letters) {
	const n = items.length;
	const N = letters.length;
	const k = n <= N ? n : Math.max(0, Math.floor((N * N - n) / (N - 1)));
	const free = new Set(letters);
	const singles = [];
	// each item's own initial where it is still free, then whatever is left
	for (let i = 0; i < k; i++) {
		const c = label_of(items[i].el)[0];
		if (c && free.has(c)) {
			free.delete(c);
			singles[i] = c;
		}
	}
	const pool = [...free];
	for (let i = 0; i < k; i++) if (!singles[i]) singles[i] = pool.shift();
	const out = singles;
	for (const p of pool) for (const b of letters) if (out.length < n) out.push(p + b);
	return out;
}

// the page first, then the navbar, then the rail and the list sidebar
const rank = (el) =>
	el.closest(".page-head, .page-actions") ? 0 : el.closest(".layout-main-section, .form-layout, .modal") ? 1 : el.closest("header.navbar") ? 2 : 3;

function show() {
	const found = [...document.querySelectorAll(TARGETS)];
	const set = new Set(found);
	const items = [];
	for (const el of found) {
		// the outermost clickable wins: a link inside a row button is one target, not two
		let p = el.parentElement && el.parentElement.closest(TARGETS);
		if (p && set.has(p) && el.tagName !== "INPUT" && el.tagName !== "SELECT" && el.tagName !== "TEXTAREA") continue;
		// a report's rows change with every run: no letters in them (the grid's own key gets you in)
		if (el.closest(".dt-scrollable, .frappe-list .result .list-row-container")) continue;
		const r = visible(el);
		if (r) items.push({ el, r });
	}
	if (!items.length) return;
	// fixed letters first; the rest share what is left
	const fixed = [];
	const frm = current_form();
	if (frm && form_keys[frm.doctype]) {
		for (let i = items.length - 1; i >= 0; i--) if (items[i].el.closest(".form-layout") && !items[i].el.matches(".section-head.collapsible")) items.splice(i, 1);
		fixed.push(...form_targets(frm));
		// a section with its own stored key: no second, passing one
		for (let i = items.length - 1; i >= 0; i--) if (fixed.some((f) => f.el === items[i].el)) items.splice(i, 1);
	}
	const page = !frm && current_page();
	let page_codes = [];
	if (page) {
		// workspaces draw late: anything new gets its key for next time
		load_page_keys();
		const mine = page_targets(page);
		for (const t of mine) {
			const i = items.findIndex((it) => it.el === t.el || it.el.contains(t.el) || t.el.contains(it.el));
			if (i >= 0) items.splice(i, 1);
		}
		fixed.push(...mine.filter((t) => t.r));
		page_codes = Object.values(page_keys[page.id] || {});
	}
	for (const [code, sel] of FIXED) {
		const hit = [...document.querySelectorAll(sel)].find((el) => !el.closest(".dropdown-menu") && visible(el));
		if (!hit) continue;
		const i = items.findIndex((it) => it.el === hit || it.el.contains(hit) || hit.contains(it.el));
		if (i >= 0) items.splice(i, 1);
		fixed.push({ el: hit, r: visible(hit), code });
	}
	// rail workspaces by number, in rail order: 1-9, then 01-09, 00 (prefix-free)
	const NUMS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "01", "02", "03", "04", "05", "06", "07", "08", "09", "00"];
	let spaces = [...document.querySelectorAll("a.tt-item[data-ws]")].filter((el) => !el.closest(".tt-kids"));
	// plain Desk: the workspace sidebar, top level only
	if (!spaces.length)
		spaces = [...document.querySelectorAll(".desk-sidebar a.item-anchor")].filter(
			(el) => !el.closest(".sidebar-child-item")
		);
	let num = 0;
	for (const el of spaces) {
		if (num >= NUMS.length) break;
		const r = visible(el);
		if (!r) continue;
		const i = items.findIndex((it) => it.el === el);
		if (i >= 0) items.splice(i, 1);
		fixed.push({ el, r, code: NUMS[num++] });
	}
	// a fixed code's first character can start nothing else
	const taken = new Set(fixed.map((f) => f.code[0]).concat(page_codes.map((c) => c[0])));
	const left = [...ALPHABET].filter((c) => !taken.has(c)).join("");
	if (!left) items.length = 0;
	items.sort((x, y) => rank(x.el) - rank(y.el));
	const codes = codes_for(items, left).concat(fixed.map((f) => f.code));
	items.push(...fixed);
	layer = document.createElement("div");
	layer.className = "tt-keytips";
	tips = items.map((it, i) => {
		const base = { code: codes[i], el: it.el, go: it.go, map: it.map, id: it.id, label: it.label };
		if (!it.r) return { ...base, tip: null };
		const tip = document.createElement("span");
		tip.textContent = codes[i].toUpperCase();
		tip.style.left = `${Math.max(it.r.left, 0)}px`;
		tip.style.top = `${Math.max(it.r.top, 0)}px`;
		layer.appendChild(tip);
		return { ...base, tip };
	});
	document.body.appendChild(layer);
	typed = "";
}

function hide() {
	if (layer) layer.remove();
	layer = null;
	tips = [];
	typed = "";
	editing = false;
}

function activate(el) {
	hide();
	if (el.matches("input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select")) {
		el.focus();
		return;
	}
	if (typeof el.focus === "function") el.focus({ preventScroll: true });
	el.click();
}

function on_key(e) {
	if (layer) {
		// Alt then Down on a list: Desk's own Down puts you on the first row and keeps count
		if (e.key === "ArrowDown") {
			const page = current_page();
			if (page && page.kind === "list") return hide();
		}
		e.preventDefault();
		e.stopImmediatePropagation();
		if (e.key === "Escape" || e.key === "Alt") return hide();
		// = or . (by character or by the physical key, for any keyboard layout)
		const edit_key = ["=", "+", "."].includes(e.key) || ["Equal", "Period", "NumpadAdd", "NumpadDecimal"].includes(e.code);
		if (edit_key && !editing) {
			if (can_edit()) return start_editing();
			frappe.show_alert({ message: __("Only a System Manager can change keys"), indicator: "orange" });
			return hide();
		}
		// Alt then Down: into the rows of a list or report; Desk's own arrows take it from there
		if (e.key === "ArrowDown") {
			hide();
			return into_rows();
		}
		if (e.key === "Backspace") typed = typed.slice(0, -1);
		else if (e.key.length === 1 && /[a-z0-9]/i.test(e.key)) typed += e.key.toLowerCase();
		else return;
		const left = tips.filter((t) => t.code.startsWith(typed) && (!editing || t.map));
		if (!left.length) return hide();
		const exact = left.find((t) => t.code === typed);
		if (exact && left.length === 1 && editing) return edit_tip(exact);
		if (exact && left.length === 1) return exact.go ? (hide(), exact.go()) : activate(exact.el);
		for (const t of tips) {
			if (!t.tip) continue;
			t.tip.hidden = !t.code.startsWith(typed);
			t.tip.dataset.typed = typed.length;
		}
		return;
	}
	armed = e.key === "Alt" && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.repeat;
}

function on_keyup(e) {
	if (e.key !== "Alt" || !armed) return;
	armed = false;
	// keep the browser from moving focus to its own menu bar
	e.preventDefault();
	attempt("keytips", "show", show);
}

const STYLE = `
.tt-keytips { position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; }
.tt-keytips span {
	position: fixed; transform: translate(-2px, -2px);
	font: 600 11px/1 var(--font-stack, system-ui), sans-serif; letter-spacing: .04em;
	padding: 3px 5px; border-radius: 5px;
	background: var(--gray-900, #111); color: #fff;
	box-shadow: 0 1px 4px rgba(0,0,0,.35), 0 0 0 1px rgba(255,255,255,.25);
}
/* Desk's own arrow keys move through list rows: show where they are */
.list-row-container:focus-visible, .list-row-container:focus { outline: 2px solid var(--primary, #2f6df2); outline-offset: -2px; border-radius: 8px; }
.tt-keytips.tt-edit span { pointer-events: auto; cursor: pointer; outline: 2px dashed var(--yellow-500, #e6a700); }
.tt-keytips.tt-edit span[data-fixed] { pointer-events: none; opacity: .35; outline: none; }
.tt-edit-note {
	position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%);
	padding: 8px 14px; border-radius: 8px; font: 500 13px/1.3 var(--font-stack, system-ui), sans-serif;
	background: var(--yellow-500, #e6a700); color: #111; box-shadow: 0 2px 10px rgba(0,0,0,.3);
}
.tt-keytips span[data-typed="1"] { background: var(--primary, #2f6df2); }
`;

function setup_keytips() {
	if (matchMedia("(hover: none)").matches) return;
	const style = document.createElement("style");
	style.textContent = STYLE;
	document.head.appendChild(style);
	// capture: ahead of Desk's own shortcut handlers while the tips are up
	addEventListener("keydown", (e) => attempt("keytips", "keydown", () => on_key(e)), true);
	addEventListener("keyup", (e) => attempt("keytips", "keyup", () => on_keyup(e)), true);
	addEventListener("keydown", (e) => attempt("keytips", "grid key", () => on_grid_key(e)), true);
	addEventListener(
		"mousedown",
		(e) => {
			armed = false;
			if (editing && layer && layer.contains(e.target)) return;
			hide();
		},
		true
	);
	addEventListener("scroll", hide, true);
	addEventListener("resize", hide);
	addEventListener("blur", () => ((armed = false), hide()));
	frappe.router.on("change", () => {
		hide();
		// the form is drawn a moment after the route changes
		setTimeout(() => attempt("keytips", "load_form_keys", load_form_keys), 400);
		// lists and workspaces fill in over a second or two
		for (const ms of [800, 2500]) setTimeout(() => attempt("keytips", "load_page_keys", load_page_keys), ms);
	});
	$(document).on("form-refresh", () => attempt("keytips", "load_form_keys", load_form_keys));
	setTimeout(() => attempt("keytips", "load_form_keys", load_form_keys), 400);
	for (const ms of [800, 2500]) setTimeout(() => attempt("keytips", "load_page_keys", load_page_keys), ms);
}

let started = false;
function start() {
	if (started || !window.frappe || !frappe.router || !frappe.boot) return;
	started = true;
	attempt("keytips", "setup_keytips", setup_keytips);
}
$(document).on("toolbar_setup", start);
$(() => start());
