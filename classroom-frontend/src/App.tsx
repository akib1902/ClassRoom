import { lazy, Suspense } from "react";
import {Refine, GitHubBanner, Authenticated} from "@refinedev/core";
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
import { BookOpen, Box, Home, Megaphone } from "lucide-react";
import SubjectsList from "./pages/subjects/list";
import SubjectCreate from "./pages/subjects/create";
import SubjectEdit from "./pages/subjects/edit";
import SubjectShow from "./pages/subjects/show";
import NoticesList from "./pages/notices/list";
import NoticeCreate from "./pages/notices/create";
import NoticeEdit from "./pages/notices/edit";
import NoticesManage from "./pages/notices/manage";
import { RequireRole } from "./components/refine-ui/auth/require-role";

const Classroom3D = lazy(() => import("./pages/classroom-3d"));

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
                show: '/subjects/show/:id',
                meta: { label: "Subjects", icon: <BookOpen />},
              },
              {
                name: "notices",
                list: "/notices",
                create: "/notices/create",
                edit: "/notices/edit/:id",
                meta: { label: "Notices", icon: <Megaphone />},
              },
              {
                name: "classroom3d",
                list: "/classroom-3d",
                meta: { label: "3D Classroom", icon: <Box />},
              }
              ]}
            >              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route element={
                  <Authenticated key="protected-routes">
                    <Layout>
                      <Outlet/>
                    </Layout>
                  </Authenticated>
                }>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/subjects">
                    <Route index element={<SubjectsList />} />
                    <Route
                      path="create"
                      element={
                        <RequireRole
                          allow={["admin"]}
                          title="Create subject"
                          description="Managing the subject catalogue is limited to admins."
                          backTo="/subjects"
                          backLabel="Back to subjects"
                        >
                          <SubjectCreate />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="edit/:id"
                      element={
                        <RequireRole
                          allow={["admin"]}
                          title="Edit subject"
                          description="Managing the subject catalogue is limited to admins."
                          backTo="/subjects"
                          backLabel="Back to subjects"
                        >
                          <SubjectEdit />
                        </RequireRole>
                      }
                    />
                    <Route path="show/:id" element={<SubjectShow />} />
                  </Route>
                  <Route path="/notices">
                    <Route index element={<NoticesList />} />
                    <Route
                      path="create"
                      element={
                        <RequireRole
                          allow={["admin", "instructor"]}
                          title="Create notice"
                          description="Students can read the notice board, but posting announcements is limited to admins and instructors."
                          backTo="/notices"
                          backLabel="Back to the notice board"
                        >
                          <NoticeCreate />
                        </RequireRole>
                      }
                    />
                    <Route
                      path="edit/:id"
                      element={
                        <RequireRole
                          allow={["admin"]}
                          title="Edit notice"
                          description="Editing notices is limited to admins — ask an admin, or post a new notice instead."
                          backTo="/notices"
                          backLabel="Back to the notice board"
                        >
                          <NoticeEdit />
                        </RequireRole>
                      }
                    />
                    <Route path="manage" element={<NoticesManage />} />
                  </Route>
                  <Route
                    path="/classroom-3d"
                    element={
                      <Suspense
                        fallback={
                          <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
                            Loading 3D classroom…
                          </div>
                        }
                      >
                        <Classroom3D />
                      </Suspense>
                    }
                  />
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
