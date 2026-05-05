import Sidebar from "@/components/landing/Sidebar";
import MainContent from "@/components/landing/MainContent";

export default function LandingPage() {
  return (
    <div className="relative flex min-h-screen w-full flex-col lg:flex-row">
      <Sidebar />
      <MainContent />
    </div>
  );
}
