import Sidebar from "@/components/landing/Sidebar";
import MainContent from "@/components/landing/MainContent";

export default function LandingPage() {
  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full relative">
      <Sidebar />
      <MainContent showAgeNotice />
    </div>
  );
}
