import { useAppStore } from "@/store/useAppStore";
import ProjectHome from "@/components/Project/ProjectHome";
import MatchEditor from "@/components/Layout/MatchEditor";

export default function App() {
  const currentProjectId = useAppStore((s) => s.currentProjectId);

  if (!currentProjectId) {
    return <ProjectHome />;
  }

  return <MatchEditor projectId={currentProjectId} />;
}
