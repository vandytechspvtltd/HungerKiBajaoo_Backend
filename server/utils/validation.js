export const validateEmail = (email) => {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validatePhone = (phone) => {
  if (!phone) return false;
  return /^\+[1-9]\d{1,14}$/.test(phone);
};

export const validateRequiredFields = (fields, body) => {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return false;
    }
  }
  return true;
};
