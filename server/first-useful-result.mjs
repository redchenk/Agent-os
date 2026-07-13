export function firstUsefulResult(tasks = []) {
  if (!tasks.length) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    let remaining = tasks.length;
    let firstError = null;
    let settled = false;

    const finishEmpty = () => {
      remaining -= 1;
      if (remaining || settled) return;
      settled = true;
      if (firstError) reject(firstError);
      else resolve([]);
    };

    tasks.forEach((task) => {
      Promise.resolve(task)
        .then((items) => {
          if (settled) return;
          if (Array.isArray(items) && items.length) {
            settled = true;
            resolve(items);
            return;
          }
          finishEmpty();
        })
        .catch((error) => {
          firstError ||= error;
          finishEmpty();
        });
    });
  });
}
