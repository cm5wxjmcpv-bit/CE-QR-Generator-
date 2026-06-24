/*
Shift QR Tabs backend helper for the CE QR Generator.

Add this file's functions to the existing Google Apps Script project.
Then add these hooks to the existing doGet/doPost handlers:

1) Near the top of doGet(e):
   const shiftQrGet = shiftQrHandleDoGet_(e);
   if (shiftQrGet) return shiftQrGet;

2) In doPost(e), after the JSON payload is parsed:
   const shiftQrPost = shiftQrHandleDoPost_(payload);
   if (shiftQrPost) return shiftQrPost;

3) Run setupShiftQRTabs() once from Apps Script.
4) In Apps Script Project Settings > Script Properties, add:
   SHIFT_TABS_ADMIN_CODE = your private admin code
*/

const SHIFT_QR_SHEET_NAME = 'ShiftQRCodes';
const SHIFT_QR_HEADERS = [
  'ShiftId',
  'ShiftLabel',
  'DisplayName',
  'FirstName',
  'LastName',
  'CertNumber',
  'CodeText',
  'SortOrder',
  'UpdatedAt'
];

const SHIFT_QR_GROUPS = [
  { id: 'a-shift', label: 'A Shift' },
  { id: 'b-shift', label: 'B Shift' },
  { id: 'c-shift', label: 'C Shift' },
  { id: 'admin', label: 'Admin' },
  { id: 'transport', label: 'Transport' }
];

function shiftQrHandleDoGet_(e) {
  const action = String((e && e.parameter && e.parameter.action) || '').trim();
  if (action !== 'getShiftQRCodes') return null;
  return shiftQrJson_({ ok: true, shifts: getShiftQRCodes_() });
}

function shiftQrHandleDoPost_(payload) {
  const action = String((payload && payload.action) || '').trim();

  if (action === 'saveShiftQRCodes') {
    try {
      saveShiftQRCodes_(payload);
      return shiftQrJson_({ ok: true, message: 'Shift QR tabs saved.' });
    } catch (err) {
      return shiftQrJson_({ ok: false, error: err.message || String(err) });
    }
  }

  return null;
}

function setupShiftQRTabs() {
  const sheet = shiftQrGetOrCreateSheet_();
  sheet.getRange(1, 1, 1, SHIFT_QR_HEADERS.length).setValues([SHIFT_QR_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, SHIFT_QR_HEADERS.length);
}

function getShiftQRCodes_() {
  const sheet = shiftQrGetOrCreateSheet_();
  const lastRow = sheet.getLastRow();
  const rows = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, SHIFT_QR_HEADERS.length).getValues()
    : [];

  return SHIFT_QR_GROUPS.map(group => {
    const members = rows
      .filter(row => String(row[0]).trim() === group.id)
      .sort((a, b) => Number(a[7] || 0) - Number(b[7] || 0))
      .map(row => ({
        displayName: String(row[2] || '').trim(),
        firstName: String(row[3] || '').trim(),
        lastName: String(row[4] || '').trim(),
        certNumber: String(row[5] || '').trim(),
        codeText: String(row[6] || '').trim()
      }));

    return {
      id: group.id,
      label: group.label,
      members
    };
  });
}

function saveShiftQRCodes_(payload) {
  shiftQrRequireAdminCode_(payload);
  const sheet = shiftQrGetOrCreateSheet_();
  const shifts = Array.isArray(payload.shifts) ? payload.shifts : [];
  const validGroups = new Map(SHIFT_QR_GROUPS.map(group => [group.id, group]));
  const now = new Date();
  const output = [];

  shifts.forEach(shift => {
    const shiftId = String(shift.id || shift.shiftId || '').trim();
    if (!validGroups.has(shiftId)) return;

    const group = validGroups.get(shiftId);
    const members = Array.isArray(shift.members) ? shift.members : [];

    members.forEach((member, index) => {
      const firstName = String(member.firstName || '').trim().toUpperCase();
      const lastName = String(member.lastName || '').trim().toUpperCase();
      const certNumber = String(member.certNumber || '').trim().toUpperCase();
      const displayName = String(member.displayName || `${firstName} ${lastName}`).trim();
      const codeText = String(member.codeText || (firstName && lastName && certNumber ? `${certNumber}${lastName}|${firstName}` : '')).trim().toUpperCase();

      if (!displayName && !codeText && !certNumber) return;

      output.push([
        shiftId,
        group.label,
        displayName,
        firstName,
        lastName,
        certNumber,
        codeText,
        index + 1,
        now
      ]);
    });
  });

  setupShiftQRTabs();

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, SHIFT_QR_HEADERS.length).clearContent();
  }

  if (output.length) {
    sheet.getRange(2, 1, output.length, SHIFT_QR_HEADERS.length).setValues(output);
  }

  sheet.autoResizeColumns(1, SHIFT_QR_HEADERS.length);
}

function shiftQrRequireAdminCode_(payload) {
  const expected = PropertiesService.getScriptProperties().getProperty('SHIFT_TABS_ADMIN_CODE');
  const provided = String((payload && payload.adminCode) || '').trim();

  if (!expected) {
    throw new Error('Missing SHIFT_TABS_ADMIN_CODE script property.');
  }

  if (!provided || provided !== expected) {
    throw new Error('Invalid admin code.');
  }
}

function shiftQrGetOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHIFT_QR_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHIFT_QR_SHEET_NAME);
  }

  const firstRow = sheet.getRange(1, 1, 1, SHIFT_QR_HEADERS.length).getValues()[0];
  const needsHeaders = SHIFT_QR_HEADERS.some((header, index) => firstRow[index] !== header);

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, SHIFT_QR_HEADERS.length).setValues([SHIFT_QR_HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function shiftQrJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
