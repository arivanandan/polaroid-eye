export const getFormData = (params) => {
  const data = new FormData();
  if (params.constructor === Array) params.forEach((p) => {
    const key = Object.keys(p)[0];
    data.append(key, p[key]);
  });
  else Object.keys(params).forEach(p => data.append(p, params[p]));
  return data;
};
