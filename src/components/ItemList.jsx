import { useSelector } from "react-redux";
import { selectItemIds } from "../store/itemsSlice.js";
import ItemCard from "./ItemCard.jsx";

export default function ItemList() {
  const ids = useSelector(selectItemIds);
  return (
    <div className="list">
      {ids.map((id) => <ItemCard key={id} id={id} />)}
    </div>
  );
}
