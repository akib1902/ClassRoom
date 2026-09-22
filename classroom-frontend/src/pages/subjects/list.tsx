import { ListView } from "@/components/refine-ui/views/list-view.tsx";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb.tsx";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEPARTMENTS_OPTIONS } from "@/constants";
import { CreateButton } from "@/components/refine-ui/buttons/create";

const SubjectsList = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all"); 

  const subjecTable = useTable<Subject>();
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
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
              <SelectTrigger>
                <SelectValue placeholder="filter by department"/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {DEPARTMENTS_OPTIONS.map((dept) => (
                  <SelectItem key={dept.value} value={dept.value}>
                    {dept.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CreateButton/>
          </div>
        </div>
      </div>
      <DataTable table={subjectTable} />
    </ListView>
  );
}

export default SubjectsList;