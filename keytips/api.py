"""Fixed keys for the fields of a form (key tips: tap Alt, then type a key).

The keys are shared by everyone on the site and never move once given, so people learn them the
way they learn Tally. The first time a form is opened its fields are given keys from their labels
(Customer gets C); a field added later gets the next free key and nobody else's changes. An
administrator can change any key in Keytip Map.

Rules, so that "Alt then a key" is never ambiguous:
  - letters the page's own buttons keep (RESERVED, see FIXED in public/js/keytips.bundle.js) and
    digits (the rail's workspaces) are never a field's one-letter key
  - a one-letter key never starts a two-letter one
  - at most MAX_SINGLES one-letter keys per form, so letters are left over to start the rest
"""

import string

import frappe

RESERVED = set("sabthuvrmp")
FREE = [c for c in string.ascii_lowercase if c not in RESERVED]
SECOND = list(string.ascii_lowercase + string.digits)
MAX_SINGLES = 8

SKIP = {
	"Section Break",
	"Column Break",
	"HTML",
	"Fold",
	"Heading",
	"Button",
	"Image",
	"Read Only",
	"Table MultiSelect",
}


def candidates(meta):
	"""The fields worth a key, the important ones first (required, bold, shown in the list or the
	filters, tables), then the rest, each in form order. Tabs and collapsible sections count as fields."""
	first, rest = [], []
	for df in meta.fields:
		# a collapsible section gets a key that opens it: its fields are hidden till then
		if df.fieldtype == "Section Break":
			if df.collapsible and df.label and not df.hidden:
				rest.append((df.fieldname, df.label))
			continue
		if df.fieldtype in SKIP or df.hidden or not df.label:
			continue
		if df.read_only and df.fieldtype not in ("Tab Break", "Table"):
			continue
		item = (df.fieldname, df.label)
		if df.fieldname == "naming_series":
			rest.append(item)
		elif df.reqd or df.bold or df.in_list_view or df.in_standard_filter or df.fieldtype == "Table":
			first.append(item)
		else:
			rest.append(item)
	return first + rest


def letters(label):
	return [c for c in label.lower() if c.isalnum()]


def initials(label):
	return [w[0] for w in label.lower().split() if w and w[0].isalnum()]


def assign(items, existing):
	"""Keys for the items that have none yet, around the ones that already do.
	items: [(id, label)], the important ones first. existing: {id: key}.
	Returns {id: key} for new items only."""
	used = set(existing.values())
	singles = {k for k in used if len(k) == 1}
	prefixes = {k[0] for k in used if len(k) == 2}
	new = {}
	for item_id, label in items:
		if item_id in existing or item_id in new:
			continue
		chars = letters(label)
		if not chars:
			continue
		key = None
		c = chars[0]
		if len(singles) < MAX_SINGLES and c in FREE and c not in singles and c not in prefixes:
			key = c
			singles.add(c)
		else:
			# a starting letter from the label if one is free to start keys, else any such letter
			# word initials first (Posting Date: D, then the rest of the label), then any letter
			words = initials(label)
			starts = []
			for ch in words + chars + FREE:
				if ch in FREE and ch not in singles and ch not in starts:
					starts.append(ch)
			for p in starts:
				pos = chars.index(p) if p in chars else -1
				later = [w for w in words if w != p]
				seconds = later + (chars[pos + 1 :] if pos >= 0 else [])
				for q in seconds + SECOND:
					if p + q not in used:
						key = p + q
						break
				if key:
					break
			if not key:
				continue
			prefixes.add(key[0])
		used.add(key)
		new[item_id] = key
	return new


def keys_for(page, items, labels):
	"""Load the page's map, give keys to new items, save if anything changed. {id: key}."""
	name = frappe.db.get_value("Keytip Map", {"page": page})
	doc = frappe.get_doc("Keytip Map", name) if name else frappe.new_doc("Keytip Map")
	doc.page = page
	existing = {row.fieldname: row.key for row in doc.keys}
	new = assign(items, existing)
	if new:
		for item_id, key in new.items():
			doc.append("keys", {"fieldname": item_id, "key": key, "label": labels.get(item_id)})
		doc.flags.ignore_permissions = True
		try:
			doc.save()
			frappe.db.commit()
		except frappe.exceptions.DuplicateEntryError:
			# two people opened the page for the first time at once: the other one's keys stand
			frappe.db.rollback()
			return keys_for(page, items, labels)
		existing.update(new)
	return existing


@frappe.whitelist()
def get_keys(doctype: str):
	"""{fieldname: key} for a form, giving keys to any field that has none yet."""
	if not frappe.has_permission(doctype, "read"):
		return {}
	meta = frappe.get_meta(doctype)
	# the map's own form: a record cannot be named after its own doctype
	if meta.istable or doctype == "Keytip Map":
		return {}
	items = candidates(meta)
	return keys_for(doctype, items, dict(items))


@frappe.whitelist()
def get_page_keys(page: str, items: str | list):
	"""{id: key} for a list, report or workspace. The browser sends what the page shows, [[id, label], ...],
	the important ones first: the page is drawn there, not here."""
	kind, _, target = page.partition(":")
	if kind == "list":
		if not frappe.db.exists("DocType", target) or not frappe.has_permission(target, "read"):
			return {}
	elif kind == "report":
		if not frappe.db.exists("Report", target) or not frappe.has_permission("Report", "read"):
			return {}
	elif kind == "workspace":
		if not frappe.db.exists("Workspace", target):
			return {}
	else:
		return {}
	items = frappe.parse_json(items) if isinstance(items, str) else items
	clean = []
	for pair in (items or [])[:200]:
		if isinstance(pair, (list, tuple)) and len(pair) == 2 and pair[0] and pair[1]:
			clean.append((str(pair[0])[:140], str(pair[1])[:140]))
	return keys_for(page[:140], clean, dict(clean))


@frappe.whitelist()
def set_key(page: str, item: str, key: str):
	"""Change one item's key (edit mode, System Manager only). page: a doctype for a form's map, or
	list:/report:/workspace: for a page's. Keeps the map prefix-free. Returns the map {id: key}."""
	frappe.only_for("System Manager")
	key = (key or "").strip().lower()
	if not (1 <= len(key) <= 2 and key[0] in string.ascii_lowercase and all(c in SECOND for c in key)):
		frappe.throw("A key is one or two characters: a letter, then a letter or digit.")
	if len(key) == 1 and key in RESERVED:
		frappe.throw(f"{key.upper()} is kept for the page's own buttons ({''.join(sorted(RESERVED)).upper()}).")
	name = frappe.db.get_value("Keytip Map", {"page": page[:140]})
	if not name:
		frappe.throw("No keys for this page yet.")
	doc = frappe.get_doc("Keytip Map", name)
	row = next((r for r in doc.keys if r.fieldname == item), None)
	if not row:
		frappe.throw("That item has no key yet.")
	for other in doc.keys:
		if other is row or not other.key:
			continue
		if other.key == key or other.key.startswith(key) or key.startswith(other.key):
			frappe.throw(f"{key.upper()} clashes with {other.key.upper()} ({other.label or other.fieldname}).")
	row.key = key
	doc.flags.ignore_permissions = True
	doc.save()
	return {r.fieldname: r.key for r in doc.keys}
