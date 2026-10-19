import { describe, it, expect } from "vitest";
import { createSseParser } from "@/lib/hooks/sse";

describe("createSseParser (README Sections 14.5 and 15.8)", () => {
  it("returns the data of a complete event", () => {
    const p = createSseParser();
    expect(p.push('event: a\ndata: {"x":1}\n\n')).toEqual(['{"x":1}']);
  });

  it("buffers an event that is split across chunks", () => {
    const p = createSseParser();
    expect(p.push('event: a\ndata: {"x"')).toEqual([]);
    expect(p.push(':1}\n')).toEqual([]);
    expect(p.push('\nevent: b\ndata: {"y":2}\n\n')).toEqual(['{"x":1}', '{"y":2}']);
  });

  it("handles a split exactly between the two newlines of the separator", () => {
    const p = createSseParser();
    expect(p.push('data: one\n')).toEqual([]);
    expect(p.push('\ndata: two\n\n')).toEqual(["one", "two"]);
  });

  it("handles CRLF line endings", () => {
    const p = createSseParser();
    expect(p.push('event: a\r\ndata: hello\r\n\r\n')).toEqual(["hello"]);
  });

  it("ignores comment and keep-alive lines", () => {
    const p = createSseParser();
    expect(p.push(': ping\n\n')).toEqual([]);
    expect(p.push(': ping\ndata: kept\n\n')).toEqual(["kept"]);
  });

  it("joins multi-line data fields with a newline", () => {
    const p = createSseParser();
    expect(p.push('data: line1\ndata: line2\n\n')).toEqual(["line1\nline2"]);
  });

  it("ignores events that have no data and empty data", () => {
    const p = createSseParser();
    expect(p.push('event: only-name\n\n')).toEqual([]);
    expect(p.push('data:\n\n')).toEqual([]);
  });

  it("returns several events from one chunk in order", () => {
    const p = createSseParser();
    expect(p.push('data: 1\n\ndata: 2\n\ndata: 3\n\n')).toEqual(["1", "2", "3"]);
  });

  it("flush returns a final unterminated event and then nothing", () => {
    const p = createSseParser();
    expect(p.push('data: last')).toEqual([]);
    expect(p.flush()).toEqual(["last"]);
    expect(p.flush()).toEqual([]);
  });

  it("flush on an empty buffer returns nothing", () => {
    expect(createSseParser().flush()).toEqual([]);
  });
});
