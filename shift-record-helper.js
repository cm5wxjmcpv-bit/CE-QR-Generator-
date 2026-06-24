const CE_SHIFT_GROUPS = [
  { id: "a-shift", label: "A Shift" },
  { id: "b-shift", label: "B Shift" },
  { id: "c-shift", label: "C Shift" },
  { id: "admin", label: "Admin" },
  { id: "transport", label: "Transport" }
];

function ceShiftPageUrl(fileName) {
  return `${location.origin}${location.pathname.replace(/[^/]*$/i, fileName)}`;
}

function openShiftAdmin() {
  window.location.href = ceShiftPageUrl("admin.html");
}

function ceShiftClean(value) {
  return String(value || "").trim();
}

function ceShiftUpper(value) {
  return ceShiftClean(value).toUpperCase();
}

function ceShiftToken() {
  if (typeof ADMIN_TOKEN !== "undefined" && ADMIN_TOKEN) {
    return ADMIN_TOKEN;
  }

  const key = "ceShiftAdminCode";
  let token = sessionStorage.getItem(key) || "";

  if (!token) {
    token = prompt("Enter the admin code:") || "";
    token = token.trim();
    if (token) sessionStorage.setItem(key, token);
  }

  return token;
}

function clearCeShiftToken() {
  sessionStorage.removeItem("ceShiftAdminCode");
}

function ceShiftMemberFromRecord(record) {
  const firstName = ceShiftUpper(record.studentFirst);
  const lastName = ceShiftUpper(record.studentLast);
  const certNumber = ceShiftUpper(record.certNumber);
  const codeText =
    ceShiftUpper(record.codeText) ||
    (firstName && lastName && certNumber
      ? `${certNumber}${lastName}|${firstName}`
      : "");

  return {
    firstName,
    lastName,
    certNumber,
    displayName: `${firstName} ${lastName}`.trim(),
    codeText
  };
}

function ceShiftNormalizeTabs(incoming) {
  const byId = new Map();

  (Array.isArray(incoming) ? incoming : []).forEach(shift => {
    byId.set(
      ceShiftClean(shift.id || shift.shiftId).toLowerCase(),
      Array.isArray(shift.members) ? shift.members : []
    );
  });

  return CE_SHIFT_GROUPS.map(group => ({
    ...group,
    members: (byId.get(group.id) || [])
      .map(member => {
        const firstName = ceShiftUpper(member.firstName || member.first);
        const lastName = ceShiftUpper(member.lastName || member.last);
        const certNumber = ceShiftUpper(member.certNumber || member.cert);
        const displayName = ceShiftClean(
          member.displayName || member.name || `${firstName} ${lastName}`
        );
        const codeText =
          ceShiftUpper(member.codeText) ||
          (firstName && lastName && certNumber
            ? `${certNumber}${lastName}|${firstName}`
            : "");

        return {
          firstName,
          lastName,
          certNumber,
          displayName,
          codeText
        };
      })
      .filter(member => member.displayName || member.codeText)
  }));
}

async function addCeRecordToShift(record, shiftId, statusElement) {
  const member = ceShiftMemberFromRecord(record);
  const status = statusElement || null;

  if (status) status.textContent = "Adding...";

  if (!member.codeText) {
    if (status) status.textContent = "Missing QR text.";
    return;
  }

  const current = await apiGet({
    action: "getShiftQRCodes",
    t: Date.now()
  });

  if (!current.ok) {
    throw new Error(current.error || "Unable to load shift list.");
  }

  const shifts = ceShiftNormalizeTabs(current.shifts);
  const target = shifts.find(shift => shift.id === shiftId);

  if (!target) {
    throw new Error("Invalid shift selected.");
  }

  let alreadyInTarget = false;

  shifts.forEach(shift => {
    const keptMembers = [];

    shift.members.forEach(existing => {
      const sameProvider =
        ceShiftUpper(existing.codeText) === member.codeText;

      if (sameProvider && shift.id === target.id) {
        alreadyInTarget = true;
      }

      if (!sameProvider) {
        keptMembers.push(existing);
      }
    });

    shift.members = keptMembers;
  });

  if (!alreadyInTarget) {
    target.members.push(member);
  }

  const saved = await apiPost({
    action: "saveShiftQRCodes",
    adminCode: ceShiftToken(),
    shifts
  });

  if (!(saved && (saved.ok || saved.success))) {
    throw new Error(saved.error || "Unable to save shift list.");
  }

  if (status) {
    status.textContent = alreadyInTarget
      ? `Already in ${target.label}.`
      : `Added to ${target.label}.`;
  }
}
