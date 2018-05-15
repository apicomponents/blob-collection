//@flow
function delay(ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(), ms);
  });
}
exports.delay = delay;

const values = <T>(obj: { [string]: T }): Array<T> =>
  Object.keys(obj).map(k => obj[k]);
exports.values = values;

function isoDate(date: any): string {
  return date.toISOString().substr(0, 10);
}
exports.isoDate = isoDate;
