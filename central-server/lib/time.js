'use strict';

function nowIso() {
  return new Date().toISOString();
}

function addMonths(date, months) {
  const result = new Date(date.getTime());
  const targetMonth = result.getMonth() + months;
  const day = result.getDate();
  result.setMonth(targetMonth);
  if (result.getDate() < day) result.setDate(0);
  return result;
}

module.exports = { nowIso, addMonths };
