import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStaffPaste, staffCredentialsCsv } from './staff-bulk.ts';
test('Excel paste with BOM, header, CRLF and trailing blank rows', () => {
  assert.deepEqual(parseStaffPaste('\uFEFF名前\tメールアドレス\r\n 山田 太郎 \tyamada@example.com\r\n\t\r\n'), [{name:'山田 太郎',email:'yamada@example.com'}]);
});
test('quoted CSV supports names with commas, quotes and line breaks', () => {
  assert.deepEqual(parseStaffPaste('name,email\n"Doe, ""Jane""",jane@example.com\n"A\nB",a@example.com'), [{name:'Doe, "Jane"',email:'jane@example.com'},{name:'A\nB',email:'a@example.com'}]);
});
test('malformed input cannot silently discard columns or names', () => {
  for(const text of ['', 'name,email', 'a,b,c', 'a', '"a,b', '"a"x,b']) assert.throws(()=>parseStaffPaste(text));
  assert.throws(()=>parseStaffPaste(Array(101).fill('a,b@example.com').join('\n')));
  assert.equal(parseStaffPaste(Array(100).fill('a,b@example.com').join('\n')).length,100);
});
test('credential CSV excludes existing staff and neutralizes spreadsheet formulas', () => {
  const csv=staffCredentialsCsv([{row:1,status:'new',name:'=HYPERLINK("bad")',email:'a@example.com',initialPassword:'-secret',message:''},{row:2,status:'skip',name:'existing',email:'existing@example.com',message:''}]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"\'-secret"'));
  assert.ok(!csv.includes('existing@example.com'));
});
