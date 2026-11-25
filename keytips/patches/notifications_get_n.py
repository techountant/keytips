"""Notifications took N (it was B): items whose key starts with N get a new one; the rest keep theirs."""

import frappe

from keytips.api import assign


def execute():
	for name in frappe.get_all("Keytip Map", pluck="name"):
		doc = frappe.get_doc("Keytip Map", name)
		moved = [r for r in doc.keys if r.key and r.key[0] == "n"]
		if not moved:
			continue
		existing = {r.fieldname: r.key for r in doc.keys if r not in moved}
		new = assign([(r.fieldname, r.label or r.fieldname) for r in moved], existing)
		for r in moved:
			r.key = new.get(r.fieldname)
		doc.keys = [r for r in doc.keys if r.key]
		doc.flags.ignore_permissions = True
		doc.save()
