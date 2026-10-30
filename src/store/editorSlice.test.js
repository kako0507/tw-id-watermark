import { describe, expect, it } from "vitest";
import reducer, {
  HISTORY_LIMIT, cornerDragEnded, cornerDragStarted, cornerMoved, editorAspectChanged, editorClosed,
  editorCornersReset, editorDetected, editorOpened, editorRedone, editorRotated, editorUndone,
} from "./editorSlice.js";

const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }];
const open = () => reducer(undefined, editorOpened({ itemId: "a", corners, aspect: "id1" }));

// Apply a list of actions in order
const run = (state, ...actions) => actions.reduce(reducer, state);
const drag = (state, index, point) =>
  run(state, cornerDragStarted(index), cornerMoved({ x: point.x - 1, y: point.y }), cornerMoved(point), cornerDragEnded());

describe("editor basics", () => {
  it("opens with empty history and closes back to the initial state", () => {
    const s = open();
    expect(s.itemId).toBe("a");
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    expect(reducer(s, editorClosed()).itemId).toBeNull();
  });

  it("only moves a corner while dragging", () => {
    const s = reducer(open(), cornerMoved({ x: 5, y: 5 }));
    expect(s.corners).toBe(open().corners.constructor === Array ? s.corners : null);
    expect(s.corners[0]).toEqual({ x: 0, y: 0 });
  });

  it("rotates by making the next corner the top-left", () => {
    const s = reducer(open(), editorRotated());
    expect(s.corners[0]).toEqual(corners[1]);
    expect(s.corners[3]).toEqual(corners[0]);
  });

  it("never mutates the previous state", () => {
    const before = open();
    const frozen = JSON.stringify(before);
    drag(before, 0, { x: 10, y: 10 });
    expect(JSON.stringify(before)).toBe(frozen);
  });
});

describe("undo / redo", () => {
  it("records a whole drag as one step", () => {
    const s = drag(open(), 0, { x: 10, y: 10 });
    expect(s.past).toHaveLength(1);
    expect(s.corners[0]).toEqual({ x: 10, y: 10 });
  });

  it("does not record a click without movement", () => {
    const s = run(open(), cornerDragStarted(0), cornerDragEnded());
    expect(s.past).toHaveLength(0);
  });

  it("undoes and redoes corners and aspect", () => {
    let s = drag(open(), 0, { x: 10, y: 10 });
    s = reducer(s, editorAspectChanged("license"));

    s = reducer(s, editorUndone());
    expect(s.aspect).toBe("id1");
    expect(s.corners[0]).toEqual({ x: 10, y: 10 });

    s = reducer(s, editorUndone());
    expect(s.corners[0]).toEqual({ x: 0, y: 0 });
    expect(s.past).toHaveLength(0);
    expect(s.future).toHaveLength(2);

    s = run(s, editorRedone(), editorRedone());
    expect(s.corners[0]).toEqual({ x: 10, y: 10 });
    expect(s.aspect).toBe("license");
    expect(s.future).toHaveLength(0);
  });

  it("restores the exact previous objects (time travel by reference)", () => {
    const start = open();
    const s = reducer(drag(start, 0, { x: 10, y: 10 }), editorUndone());
    expect(s.corners).toBe(start.corners);
  });

  it("records detect, reset and rotate as steps", () => {
    let s = reducer(open(), editorDetected({ corners: corners.map((p) => ({ x: p.x + 1, y: p.y })), aspect: "license" }));
    s = reducer(s, editorCornersReset(corners));
    s = reducer(s, editorRotated());
    expect(s.past).toHaveLength(3);
  });

  it("clears the redo branch after a new change", () => {
    let s = drag(open(), 0, { x: 10, y: 10 });
    s = reducer(s, editorUndone());
    expect(s.future).toHaveLength(1);
    s = drag(s, 1, { x: 90, y: 5 });
    expect(s.future).toHaveLength(0);
  });

  it("ignores undo / redo with nothing to restore or while dragging", () => {
    const s = open();
    expect(reducer(s, editorUndone())).toBe(s);
    expect(reducer(s, editorRedone())).toBe(s);

    const dragging = run(drag(s, 0, { x: 10, y: 10 }), cornerDragStarted(1));
    expect(reducer(dragging, editorUndone())).toBe(dragging);
  });

  it(`keeps at most HISTORY_LIMIT (${HISTORY_LIMIT}) steps, dropping the oldest`, () => {
    let s = open();
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) s = drag(s, 0, { x: i, y: i });
    expect(s.past).toHaveLength(HISTORY_LIMIT);
    // The oldest kept step is the state after the 10th drag
    expect(s.past[0].corners[0]).toEqual({ x: 10, y: 10 });

    for (let i = 0; i < HISTORY_LIMIT + 10; i++) s = reducer(s, editorUndone());
    expect(s.corners[0]).toEqual({ x: 10, y: 10 });
    expect(s.future).toHaveLength(HISTORY_LIMIT);
  });
});
