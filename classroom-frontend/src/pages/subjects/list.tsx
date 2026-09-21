import { ListView } from "@/components/refine-ui/views/list-view.tsx";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb.tsx";
import { useState } from "react";

const SubjectsList = () => {
  const [searchQuery, setSearchQuery] = useState("");
  return (
    <ListView>
      <Breadcrumb />
      <h1>Subjects List</h1>
      <div className="intro-row">
        <p>quick access to essential matrics and tools</p>
        <div className="actions-row">
          <div className="search-field">
            <search className="search-icon"/>
            <input type="text" placeholder="Search name..." className="pl-10 w-full" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>
      </div>
    </ListView>
  );
}

export default SubjectsList;