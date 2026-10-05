import {Refine, GitHubBanner} from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import { BrowserRouter, Route, Routes, Outlet } from "react-router";
import routerProvider, {
  UnsavedChangesNotifier,
  DocumentTitleHandler,
} from "@refinedev/react-router";
import { dataProvider } from "./providers/data";
import { authProvider } from "./providers/auth";
import { Login } from "./pages/login";
import { Register } from "./pages/register";
import { ForgotPassword } from "./pages/forgot-password";
import { ErrorComponent } from "./components/refine-ui/layout/error-component";
import { Layout } from "./components/refine-ui/layout/layout";
import Dashboard from "./pages/dashboard";
import { useNotificationProvider } from "./components/refine-ui/notification/use-notification-provider";
import { Toaster } from "./components/refine-ui/notification/toaster";
import { ThemeProvider } from "./components/refine-ui/theme/theme-provider";
import "./App.css";
import { BookOpen, Home } from "lucide-react";
import SubjectsList from "./pages/subjects/list";
import SubjectCreate from "./pages/subjects/create";
import SubjectEdit from "./pages/subjects/edit";

function App() {
  return (
    <BrowserRouter>
      <GitHubBanner />
      <RefineKbarProvider>
        <ThemeProvider>
          <DevtoolsProvider>
            <Refine
              dataProvider={dataProvider}
              authProvider={authProvider}
              notificationProvider={useNotificationProvider()}
              routerProvider={routerProvider}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
                projectId: "CpJNOp-Oj8jbq-MTYSNp",
              }}
              resources={[{
                name: "dashboard",
                list: "/",
                meta: { label: "Dashboard" , icon: <Home />},
              },
              {
                name: "subjects",
                list: "/subjects",
                create: '/subjects/create',
                edit: '/subjects/edit/:id',
                meta: { label: "Subjects", icon: <BookOpen />},
              }
              ]}
            >
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route element={<Layout>
                  <Outlet/>
                </Layout>}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/subjects">
                  <Route index element={<SubjectsList />} />  
                  <Route path="create" element={<SubjectCreate />} />  
                  <Route path="edit/:id" element={<SubjectEdit />} />
                </Route>
                <Route path="*" element={<ErrorComponent />} />
                </Route>
              </Routes>
              <Toaster />
              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler />
            </Refine>
            <DevtoolsPanel />
          </DevtoolsProvider>
        </ThemeProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
