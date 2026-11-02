import { createSlice } from "@reduxjs/toolkit";

export const DEFAULT_SETTINGS = {
  autoCrop: true,
  autoRotate: true,   // Turn detected cards upright (landscape, right way up)
  cardType: "guess",  // "guess" | a CARD_SIZES key | "points"
  cropMargin: 1,      // Extra border kept around the card when cropping (mm)
  customWidth: 0,     // Custom card size (mm) used with "points"; 0 = follow the four corners
  customHeight: 0,
  text: "僅供申辦XXX使用",
  opacity: 0.2,
  color: "#ff0000",
  angle: 30,
  size: 7,            // Font size = image short side x size%
  spacing: 0.9,
};

const settingsSlice = createSlice({
  name: "settings",
  initialState: DEFAULT_SETTINGS,
  reducers: {
    settingChanged(state, { payload: { key, value } }) {
      if (key in DEFAULT_SETTINGS) state[key] = value;
    },
    settingsReset: () => DEFAULT_SETTINGS,
  },
});

export const { settingChanged, settingsReset } = settingsSlice.actions;
export default settingsSlice.reducer;
