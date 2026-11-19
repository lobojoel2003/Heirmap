import { GuidePanel } from './components/GuidePanel';
import { PropertyDialog } from './components/PropertyDialog';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { TreeCanvas } from './components/TreeCanvas';
import { Welcome } from './components/Welcome';
import { ChecklistReport, FamilyChartReport } from './reports/Reports';
import { useActiveCase, useStore } from './store/store';
import { useAnalysis, useCurrentAnalysis } from './useAnalysis';

export function App() {
  const file = useActiveCase();
  const analysis = useAnalysis();
  const current = useCurrentAnalysis();
  const report = useStore((s) => s.report);
  const propertyOpen = useStore((s) => s.propertyOpen);
  const setPropertyOpen = useStore((s) => s.setPropertyOpen);

  if (!file || !analysis || !current) return <Welcome />;

  return (
    <>
      <div className="app">
        <TopBar file={file} />
        <div className="workspace">
          <GuidePanel file={file} analysis={current} />
          <TreeCanvas file={file} analysis={analysis} />
          <RightPanel file={file} analysis={analysis} />
        </div>
      </div>
      {report === 'chart' ? <FamilyChartReport file={file} analysis={current} /> : null}
      {report === 'checklist' ? <ChecklistReport file={file} analysis={current} /> : null}
      {propertyOpen ? <PropertyDialog file={file} onClose={() => setPropertyOpen(false)} /> : null}
    </>
  );
}
