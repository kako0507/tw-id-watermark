import { createSlice } from "@reduxjs/toolkit";

// Four-corner editor. itemId === null means closed
const initialState = {
  itemId: null,
  corners: [],   // TL, TR, BR, BL in source image coordinates
  aspect: "id1",
  drag: -1,      // Index of the corner being dragged
  status: "idle", // idle | loadingLib | detecting | detected | notFound | rotated | error
  error: null,
  // Undo / redo stacks of { corners, aspect }. State is immutable, so a snapshot is just
  // a reference to the previous arrays; nothing has to be deep-copied
  past: [],
  future: [],
};

// Max undo steps kept; older ones are dropped so history never grows without bound
export const HISTORY_LIMIT = 50;

const snapshot = (state) => ({ corners: state.corners, aspect: state.aspect });

// Call before any undoable change: remember the current step and drop the redo branch
function record(state) {
  state.past.push(snapshot(state));
  if (state.past.length > HISTORY_LIMIT) state.past.shift();
  state.future = [];
}

const sameStep = (a, b) =>
  a.aspect === b.aspect && a.corners.every((p, i) => p.x === b.corners[i].x && p.y === b.corners[i].y);

const editorSlice = createSlice({
  name: "editor",
  initialState,
  reducers: {
    editorOpened: (_, { payload: { itemId, corners, aspect } }) => ({ ...initialState, itemId, corners, aspect }),
    editorClosed: () => initialState,
    editorStatusChanged(state, { payload: { status, error = null } }) {
      state.status = status;
      state.error = error;
    },
    editorDetected(state, { payload: { corners, aspect } }) {
      record(state);
      state.corners = corners;
      state.aspect = aspect;
      state.status = "detected";
    },
    editorCornersReset(state, { payload: corners }) {
      record(state);
      state.corners = corners;
    },
    // A whole drag (down -> moves -> up) is one undo step
    cornerDragStarted(state, { payload: index }) {
      record(state);
      state.drag = index;
    },
    cornerMoved(state, { payload: point }) {
      if (state.drag >= 0) state.corners[state.drag] = point;
    },
    cornerDragEnded(state) {
      state.drag = -1;
      // A click without movement is not a step
      const last = state.past[state.past.length - 1];
      if (last && sameStep(last, state)) state.past.pop();
    },
    // Using the next corner as top-left rotates the output by 90°
    editorRotated(state) {
      record(state);
      state.corners.push(state.corners.shift());
      state.status = "rotated";
    },
    editorAspectChanged(state, { payload: aspect }) {
      record(state);
      state.aspect = aspect;
    },
    editorUndone(state) {
      if (!state.past.length || state.drag >= 0) return;
      state.future.push(snapshot(state));
      Object.assign(state, state.past.pop());
      state.status = "idle";
    },
    editorRedone(state) {
      if (!state.future.length || state.drag >= 0) return;
      state.past.push(snapshot(state));
      Object.assign(state, state.future.pop());
      state.status = "idle";
    },
    // itemsSlice also handles these two actions to write the result back to the image
    editorApplied: () => initialState,   // payload: { itemId, corners, aspect }
    editorNoCrop: () => initialState,    // payload: { itemId }
  },
});

export const {
  editorOpened, editorClosed, editorStatusChanged, editorDetected, editorCornersReset,
  cornerDragStarted, cornerMoved, cornerDragEnded, editorRotated, editorAspectChanged,
  editorUndone, editorRedone, editorApplied, editorNoCrop,
} = editorSlice.actions;
export default editorSlice.reducer;
