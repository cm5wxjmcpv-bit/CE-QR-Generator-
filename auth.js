(function () {
  const STORAGE_KEY = 'mfd_ce_auth_v1';
  const SESSION_KEY = 'mfd_ce_session_v1';

  const DEFAULT_ADMIN = {
    id: 'admin-main',
    displayName: 'Main Admin',
    username: 'admin',
    passwordHash: '713bfda78870bf9d1b2618f6f619bad3734f9f64f65d3ed7f31efc4c4fcbfd02', // ChangeMeNow!123
    active: true
  };

  const DEFAULT_INSTRUCTOR = {
    id: 'instructor-demo',
    slug: 'demo-instructor',
    displayName: 'Demo Instructor',
    username: 'demo.instructor',
    passwordHash: '15ae8e264fc588e60df19a7ca08f20f1528f3fca100168df61a68d4a50c56884', // Instructor!123
    active: true,
    deleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  function readStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object') return null;
      if (!Array.isArray(parsed.admins) || !Array.isArray(parsed.instructors)) return null;
      return parsed;
    } catch (error) {
      console.warn('Unable to parse auth store', error);
      return null;
    }
  }

  function writeStore(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function ensureStore() {
    let store = readStore();
    if (!store) {
      store = {
        schemaVersion: 1,
        initializedAt: new Date().toISOString(),
        admins: [DEFAULT_ADMIN],
        instructors: [DEFAULT_INSTRUCTOR]
      };
      writeStore(store);
      return store;
    }

    if (!store.admins.length) {
      store.admins.push(DEFAULT_ADMIN);
    }

    if (!store.instructors.length) {
      store.instructors.push(DEFAULT_INSTRUCTOR);
    }

    writeStore(store);
    return store;
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || '{}');
    } catch (error) {
      return {};
    }
  }

  function writeSession(data) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  async function hashText(text) {
    const enc = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function sanitizeSlug(slug) {
    return String(slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function buildInstructorUrls(slug) {
    const safeSlug = encodeURIComponent(slug);
    const base = window.location.origin + window.location.pathname.replace(/[^/]+$/, '');
    return {
      publicUrl: `${base}index.html?instructor=${safeSlug}`,
      dashboardUrl: `${base}instructor.html?instructor=${safeSlug}`
    };
  }

  async function loginAdmin(username, password) {
    const store = ensureStore();
    const candidate = store.admins.find(a => a.username === String(username || '').trim() && a.active);
    if (!candidate) return { ok: false, message: 'Invalid credentials.' };
    const submittedHash = await hashText(String(password || ''));
    if (candidate.passwordHash !== submittedHash) return { ok: false, message: 'Invalid credentials.' };

    const session = readSession();
    session.admin = {
      username: candidate.username,
      displayName: candidate.displayName,
      loginAt: new Date().toISOString()
    };
    writeSession(session);
    return { ok: true, admin: session.admin };
  }

  function logoutAdmin() {
    const session = readSession();
    delete session.admin;
    writeSession(session);
  }

  function getAdminSession() {
    const session = readSession();
    return session.admin || null;
  }

  function listInstructors() {
    const store = ensureStore();
    return store.instructors.filter(i => !i.deleted);
  }

  function getInstructorBySlug(slug) {
    const safeSlug = sanitizeSlug(slug);
    return listInstructors().find(i => i.slug === safeSlug) || null;
  }

  async function loginInstructor(username, password, requestedSlug) {
    const store = ensureStore();
    const normalizedUsername = String(username || '').trim();
    const candidate = store.instructors.find(i => i.username === normalizedUsername && !i.deleted && i.active);
    if (!candidate) return { ok: false, message: 'Invalid instructor credentials.' };

    const submittedHash = await hashText(String(password || ''));
    if (candidate.passwordHash !== submittedHash) {
      return { ok: false, message: 'Invalid instructor credentials.' };
    }

    const safeRequestedSlug = sanitizeSlug(requestedSlug);
    if (safeRequestedSlug && candidate.slug !== safeRequestedSlug) {
      return { ok: false, message: 'This account does not match the requested instructor URL.' };
    }

    const session = readSession();
    session.instructor = {
      username: candidate.username,
      displayName: candidate.displayName,
      slug: candidate.slug,
      loginAt: new Date().toISOString()
    };
    writeSession(session);
    return { ok: true, instructor: session.instructor };
  }

  function logoutInstructor() {
    const session = readSession();
    delete session.instructor;
    writeSession(session);
  }

  function getInstructorSession() {
    const session = readSession();
    return session.instructor || null;
  }

  async function saveInstructor(payload) {
    const store = ensureStore();
    const now = new Date().toISOString();
    const id = String(payload.id || '').trim();
    const normalizedSlug = sanitizeSlug(payload.slug);
    if (!normalizedSlug) {
      return { ok: false, message: 'Instructor ID/slug is required.' };
    }

    const normalizedUsername = String(payload.username || '').trim();
    if (!normalizedUsername) {
      return { ok: false, message: 'Username is required.' };
    }

    const collision = store.instructors.find(i => !i.deleted && i.id !== id && (i.slug === normalizedSlug || i.username === normalizedUsername));
    if (collision) {
      return { ok: false, message: 'Slug or username already exists.' };
    }

    if (id) {
      const existing = store.instructors.find(i => i.id === id);
      if (!existing) return { ok: false, message: 'Instructor record not found.' };

      existing.displayName = String(payload.displayName || '').trim();
      existing.slug = normalizedSlug;
      existing.username = normalizedUsername;
      existing.active = Boolean(payload.active);
      existing.updatedAt = now;
      if (payload.password) {
        existing.passwordHash = await hashText(payload.password);
      }
    } else {
      if (!payload.password) {
        return { ok: false, message: 'Password is required for new instructor users.' };
      }
      store.instructors.push({
        id: `instructor-${Date.now()}`,
        displayName: String(payload.displayName || '').trim(),
        username: normalizedUsername,
        slug: normalizedSlug,
        active: Boolean(payload.active),
        deleted: false,
        passwordHash: await hashText(payload.password),
        createdAt: now,
        updatedAt: now
      });
    }

    writeStore(store);
    return { ok: true };
  }

  function setInstructorActive(id, active) {
    const store = ensureStore();
    const item = store.instructors.find(i => i.id === id && !i.deleted);
    if (!item) return { ok: false, message: 'Instructor not found.' };
    item.active = Boolean(active);
    item.updatedAt = new Date().toISOString();
    writeStore(store);
    return { ok: true };
  }

  function softDeleteInstructor(id) {
    const store = ensureStore();
    const item = store.instructors.find(i => i.id === id && !i.deleted);
    if (!item) return { ok: false, message: 'Instructor not found.' };
    item.deleted = true;
    item.active = false;
    item.updatedAt = new Date().toISOString();
    writeStore(store);
    return { ok: true };
  }

  function generatePassword(length = 12) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let output = '';
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i += 1) {
      output += chars[randomValues[i] % chars.length];
    }
    return output;
  }

  window.CEAuth = {
    ensureStore,
    hashText,
    listInstructors,
    getInstructorBySlug,
    buildInstructorUrls,
    loginAdmin,
    logoutAdmin,
    getAdminSession,
    loginInstructor,
    logoutInstructor,
    getInstructorSession,
    saveInstructor,
    setInstructorActive,
    softDeleteInstructor,
    generatePassword,
    sanitizeSlug
  };
})();
