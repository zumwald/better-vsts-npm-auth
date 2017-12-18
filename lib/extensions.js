/**
 * Filters out any duplicate entries in the given array
 * @param {Array} a
 * @returns {Array}
 */
const isUnique = (e, i, a) => a.indexOf(e) === i;

module.exports = {
  isUnique
};
