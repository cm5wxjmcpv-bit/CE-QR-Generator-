const ADMIN_TOKEN = 'Martinsvilleadmin2026!';
const USERS_SHEET = 'Users';
const RECORDS_SHEET = 'Submissions';

const USER_HEADERS = ['displayName', 'username', 'password', 'role', 'instructorSlug', 'active', 'notes'];
const RECORD_HEADERS = ['timestamp', 'instructor', 'studentFirst', 'studentLast', 'certNumber', 'codeText', 'image'];

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || '').trim();

    if (!action) {
      return jsonResponse({ ok: true, records: getAllRecordsRaw_() });
    }

    switch (action) {
      case 'adminLogin':
        return handleAdminLogin_(params);
      case 'instructorLogin':
        return handleInstructorLogin_(params);
      case 'getUsers':
        return handleGetUsers_(params);
      case 'getAllRecords':
        return handleGetAllRecords_(params);
      case 'getInstructorRecords':
        return handleGetInstructorRecords_(params);
      case 'delete':
        return handleDeleteRow_(params);
      case 'checkDuplicate':
        return handleCheckDuplicate_(params);
      default:
        return jsonResponse({ ok: false, error: 'Unknown action.' });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || 'Server error.' });
  }
}

function doPost(e) {
  try {
    const payload = parseJsonBody_(e);
    const action = String(payload.action || '').trim();

    switch (action) {
      case 'addUser':
        return handleAddUser_(payload);
      case 'updateUser':
        return handleUpdateUser_(payload);
      case 'toggleUserActive':
        return handleToggleUser_(payload);
      case 'submitRecord':
      case '':
        return handleSubmitRecord_(payload);
      default:
        return jsonResponse({ ok: false, error: 'Unknown action.' });
    }
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || 'Server error.' });
  }
}

function handleAdminLogin_(params) {
  const username = clean_(params.username);
  const password = clean_(params.password);
  if (!username || !password) return jsonResponse({ ok: false, error: 'Missing credentials.' });

  const user = findUserByUsername_(username);
  if (!user || !user.active || user.password !== password || user.role !== 'admin') {
    return jsonResponse({ ok: false, error: 'Invalid admin credentials.' });
  }

  return jsonResponse({
    ok: true,
    user: {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      instructorSlug: user.instructorSlug,
      active: user.active
    }
  });
}

function handleInstructorLogin_(params) {
  const username = clean_(params.username);
  const password = clean_(params.password);
  if (!username || !password) return jsonResponse({ ok: false, error: 'Missing credentials.' });

  const user = findUserByUsername_(username);
  if (!user || !user.active || user.password !== password || user.role !== 'instructor') {
    return jsonResponse({ ok: false, error: 'Invalid instructor credentials.' });
  }

  return jsonResponse({
    ok: true,
    user: {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      instructorSlug: user.instructorSlug,
      active: user.active
    }
  });
}

function handleGetUsers_(params) {
  if (!isAdminTokenValid_(params.adminToken)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  return jsonResponse({ ok: true, users: readUsers_() });
}

function handleGetAllRecords_(params) {
  if (!isAdminTokenValid_(params.adminToken)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  return jsonResponse({ ok: true, records: getAllRecordsRaw_() });
}

function handleGetInstructorRecords_(params) {
  const username = clean_(params.username);
  const password = clean_(params.password);
  if (!username || !password) return jsonResponse({ ok: false, error: 'Missing credentials.' });

  const user = findUserByUsername_(username);
  if (!user || !user.active || user.password !== password || user.role !== 'instructor') {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  const records = getAllRecordsRaw_().filter(function (r) {
    return clean_(r.instructor).toLowerCase() === clean_(user.instructorSlug).toLowerCase() ||
      clean_(r.instructor).toLowerCase() === clean_(user.username).toLowerCase();
  });

  return jsonResponse({ ok: true, records: records });
}

function handleDeleteRow_(params) {
  if (!isAdminTokenValid_(params.adminToken)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  const row = Number(params.row);
  if (!row || row < 2) return jsonResponse({ ok: false, error: 'Invalid row.' });

  const sh = getOrCreateSheet_(RECORDS_SHEET, RECORD_HEADERS);
  const lastRow = sh.getLastRow();
  if (row > lastRow) return jsonResponse({ ok: false, error: 'Row does not exist.' });

  sh.deleteRow(row);
  return jsonResponse({ ok: true });
}

function handleCheckDuplicate_(params) {
  const cert = clean_(params.certNumber).toUpperCase();
  const last = clean_(params.lastName).toUpperCase();
  const first = clean_(params.firstName).toUpperCase();
  const codeText = clean_(params.codeText).toUpperCase() || (cert && last && first ? `${cert}${last}|${first}` : '');

  if (!codeText) return jsonResponse({ ok: false, error: 'Missing codeText.' });

  const todayKey = dateKey_(new Date());
  const records = getAllRecordsRaw_();

  const duplicate = records.some(function (r) {
    return clean_(r.codeText).toUpperCase() === codeText && dateKey_(new Date(r.timestamp)) === todayKey;
  });

  return jsonResponse({ ok: true, duplicate: duplicate });
}

function handleSubmitRecord_(payload) {
  const first = clean_(payload.firstName).toUpperCase();
  const last = clean_(payload.lastName).toUpperCase();
  const cert = clean_(payload.certNumber).toUpperCase();
  const instructor = clean_(payload.instructor) || 'Unknown';
  const image = clean_(payload.image);

  if (!first || !last || !cert) {
    return jsonResponse({ ok: false, error: 'Missing required fields.' });
  }

  const codeText = `${cert}${last}|${first}`;
  const todayKey = dateKey_(new Date());
  const records = getAllRecordsRaw_();
  const duplicate = records.some(function (r) {
    return clean_(r.codeText).toUpperCase() === codeText && dateKey_(new Date(r.timestamp)) === todayKey;
  });

  if (duplicate) {
    return jsonResponse({ ok: false, error: 'Duplicate submission for today.' });
  }

  const sh = getOrCreateSheet_(RECORDS_SHEET, RECORD_HEADERS);
  const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();

  sh.appendRow([
    timestamp.toISOString(),
    instructor,
    first,
    last,
    cert,
    codeText,
    image
  ]);

  return jsonResponse({
    ok: true,
    codeText: codeText
  });
}

function handleAddUser_(payload) {
  if (!isAdminTokenValid_(payload.adminToken)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  const user = normalizeUserInput_(payload, true);
  const users = readUsers_();

  const exists = users.some(function (u) {
    return clean_(u.username).toLowerCase() === clean_(user.username).toLowerCase();
  });

  if (exists) return jsonResponse({ ok: false, error: 'Username already exists.' });

  const sh = getOrCreateSheet_(USERS_SHEET, USER_HEADERS);
  sh.appendRow([
    user.displayName,
    user.username,
    user.password,
    user.role,
    user.instructorSlug,
    user.active,
    user.notes
  ]);

  return jsonResponse({ ok: true });
}

function handleUpdateUser_(payload) {
  if (!isAdminTokenValid_(payload.adminToken)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  const user = normalizeUserInput_(payload, false);
  const sh = getOrCreateSheet_(USERS_SHEET, USER_HEADERS);
  const users = readUsersWithRows_();

  const current = users.find(function (u) {
    return clean_(u.username).toLowerCase() === clean_(user.username).toLowerCase();
  });

  if (!current) return jsonResponse({ ok: false, error: 'User not found.' });

  const passwordToSave = user.password ? user.password : current.password;

  sh.getRange(current.row, 1, 1, USER_HEADERS.length).setValues([[
    user.displayName,
    user.username,
    passwordToSave,
    user.role,
    user.instructorSlug,
    user.active,
    user.notes
  ]]);

  return jsonResponse({ ok: true });
}

function handleToggleUser_(payload) {
  if (!isAdminTokenValid_(payload.adminToken)) {
    return jsonResponse({ ok: false, error: 'Unauthorized.' });
  }

  const username = clean_(payload.username);
  if (!username) return jsonResponse({ ok: false, error: 'Missing username.' });

  const sh = getOrCreateSheet_(USERS_SHEET, USER_HEADERS);
  const users = readUsersWithRows_();
  const current = users.find(function (u) {
    return clean_(u.username).toLowerCase() === username.toLowerCase();
  });

  if (!current) return jsonResponse({ ok: false, error: 'User not found.' });

  sh.getRange(current.row, 6).setValue(!current.active);
  return jsonResponse({ ok: true });
}

function readUsers_() {
  return readUsersWithRows_().map(function (u) {
    return {
      displayName: u.displayName,
      username: u.username,
      password: u.password,
      role: u.role,
      instructorSlug: u.instructorSlug,
      active: !!u.active,
      notes: u.notes
    };
  });
}

function readUsersWithRows_() {
  const sh = getOrCreateSheet_(USERS_SHEET, USER_HEADERS);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const values = sh.getRange(2, 1, lastRow - 1, USER_HEADERS.length).getValues();
  return values.map(function (row, idx) {
    return {
      row: idx + 2,
      displayName: clean_(row[0]),
      username: clean_(row[1]),
      password: clean_(row[2]),
      role: clean_(row[3]) || 'instructor',
      instructorSlug: clean_(row[4]),
      active: toBool_(row[5]),
      notes: clean_(row[6])
    };
  });
}

function getAllRecordsRaw_() {
  const sh = getOrCreateSheet_(RECORDS_SHEET, RECORD_HEADERS);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];

  const values = sh.getRange(2, 1, lastRow - 1, RECORD_HEADERS.length).getValues();
  return values.map(function (row, idx) {
    return {
      row: idx + 2,
      timestamp: row[0] ? new Date(row[0]).toISOString() : '',
      instructor: clean_(row[1]),
      studentFirst: clean_(row[2]),
      studentLast: clean_(row[3]),
      certNumber: clean_(row[4]),
      codeText: clean_(row[5]),
      image: clean_(row[6])
    };
  }).sort(function (a, b) {
    return new Date(b.timestamp) - new Date(a.timestamp);
  });
}

function findUserByUsername_(username) {
  const target = clean_(username).toLowerCase();
  return readUsers_().find(function (u) {
    return clean_(u.username).toLowerCase() === target;
  }) || null;
}

function normalizeUserInput_(payload, requirePassword) {
  const displayName = clean_(payload.displayName);
  const username = clean_(payload.username);
  const password = clean_(payload.password);
  const role = clean_(payload.role) === 'admin' ? 'admin' : 'instructor';
  const notes = clean_(payload.notes);

  let instructorSlug = clean_(payload.instructorSlug).toLowerCase();
  if (!instructorSlug && role === 'instructor') instructorSlug = username.toLowerCase();

  if (!displayName || !username) throw new Error('Display name and username are required.');
  if (requirePassword && !password) throw new Error('Password is required for new users.');
  if (role === 'instructor' && !instructorSlug) throw new Error('Instructor slug is required for instructor users.');

  return {
    displayName: displayName,
    username: username,
    password: password,
    role: role,
    instructorSlug: instructorSlug,
    active: toBool_(payload.active),
    notes: notes
  };
}

function getOrCreateSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  const firstRow = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeaders = headers.some(function (h, i) {
    return clean_(firstRow[i]) !== h;
  });

  if (needsHeaders) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sh;
}

function parseJsonBody_(e) {
  const body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  return JSON.parse(body || '{}');
}

function isAdminTokenValid_(token) {
  return clean_(token) === ADMIN_TOKEN;
}

function dateKey_(dt) {
  if (!(dt instanceof Date) || isNaN(dt.getTime())) return '';
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function toBool_(v) {
  if (typeof v === 'boolean') return v;
  const raw = clean_(v).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}