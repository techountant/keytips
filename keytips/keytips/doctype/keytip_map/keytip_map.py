import frappe
from frappe import _
from frappe.model.document import Document

from keytips.api import RESERVED


class KeytipMap(Document):
	def validate(self):
		seen = {}
		for row in self.keys:
			row.key = (row.key or "").strip().lower()
			if not row.key.isalnum() or len(row.key) > 2:
				frappe.throw(_("Row {0}: a key is one or two letters or digits").format(row.idx))
			if len(row.key) == 1 and row.key in RESERVED:
				frappe.throw(_("Row {0}: {1} is kept for the page's own buttons").format(row.idx, row.key.upper()))
			if row.key.isdigit():
				frappe.throw(_("Row {0}: digits are kept for the workspaces in the rail").format(row.idx))
			if row.key in seen:
				frappe.throw(_("Row {0}: {1} is already used by {2}").format(row.idx, row.key.upper(), seen[row.key]))
			seen[row.key] = row.fieldname
		# Alt then a key: a one-letter key cannot also start a two-letter one
		for k in seen:
			if len(k) == 2 and k[0] in seen:
				frappe.throw(
					_("{0} starts with {1}, which is already the key for {2}").format(
						k.upper(), k[0].upper(), seen[k[0]]
					)
				)
