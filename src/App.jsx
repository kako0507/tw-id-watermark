import { useSelector } from "react-redux";
import DropZone from "./components/DropZone.jsx";
import EditorDialog from "./components/EditorDialog.jsx";
import ItemList from "./components/ItemList.jsx";
import SamplePreview from "./components/SamplePreview.jsx";
import SettingsPanel from "./components/SettingsPanel.jsx";
import Toolbar from "./components/Toolbar.jsx";
import { selectItemTotal } from "./store/itemsSlice.js";

export default function App() {
  const count = useSelector(selectItemTotal);
  return (
    <div className="layout">
      <SettingsPanel />
      <section aria-label="圖片">
        <DropZone />
        <Toolbar />
        {count ? <ItemList /> : <SamplePreview />}
      </section>
      <EditorDialog />
    </div>
  );
}
