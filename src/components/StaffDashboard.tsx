import { useState } from 'react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Award, TrendingUp, Calendar, Bell, LogOut, Menu, Settings } from 'lucide-react';
import { PointsLog } from './PointsLog';
import { EventList } from './EventList';
import { ProgressTracker } from './ProgressTracker';
import { StaffSettings } from './StaffSettings';
import { Event, User, StaffMember, PointAdjustment } from '../App';
import { Level } from './AdminSettings';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

interface StaffDashboardProps {
  events: Event[];
  levels: Level[];
  currentUser: User;
  staffMembers: StaffMember[];
  pointAdjustments: PointAdjustment[];
  onSignUp: (eventId: string, staffId: string) => void;
  onCancelSignUp: (eventId: string, staffId: string) => void;
  onLogout: () => void;
  onUpdateEmail: (newEmail: string) => Promise<void>;
  onUpdatePassword: (newPassword: string) => Promise<void>;
}

export function StaffDashboard({
  events,
  levels,
  currentUser,
  staffMembers,
  pointAdjustments,
  onSignUp,
  onCancelSignUp,
  onLogout,
  onUpdateEmail,
  onUpdatePassword
}: StaffDashboardProps) {
  const [activeTab, setActiveTab] = useState('events');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const currentStaffMember = staffMembers.find(s => s.id === currentUser.id);
  const points = currentStaffMember?.points || 0;
  const sortedLevels = levels ? [...levels].sort((a, b) => a.order - b.order) : [];
  const level = currentStaffMember?.level || '';

  // Filter events based on user level
  // Staff can see events at their level AND all levels above them (lower order numbers)
  const currentLevelObj = sortedLevels.find(l => l.name === level);
  const eligibleEvents = events.filter(event => {
    const requiredLevelObj = sortedLevels.find(l => l.name === event.requiredLevel);
    
    // Staff with no level cannot see any events
    if (!currentLevelObj) return false;
    
    // If event has invalid level, don't show it
    if (!requiredLevelObj) return false;
    
    // Filter out draft events - staff can only see 'open' or 'closed' events
    if (event.status === 'draft' || event.status === 'cancelled') return false;
    
    // User can see events at their level or any level above them (lower order number)
    // Lower order = higher in hierarchy (top of list)
    return requiredLevelObj.order <= currentLevelObj.order;
  });

  const myEvents = eligibleEvents.filter(e => e.signedUpStaff.includes(currentUser.id));
  const availableEvents = eligibleEvents.filter(e => !e.signedUpStaff.includes(currentUser.id));

  // Calculate points to next level
  const currentLevelIndex = sortedLevels.findIndex(l => l.name === level);
  const nextLevel = currentLevelIndex >= 0 && currentLevelIndex < sortedLevels.length - 1 
    ? sortedLevels[currentLevelIndex + 1] 
    : null;
  const pointsToNextLevel = nextLevel ? Math.max(0, nextLevel.minPoints - points) : 0;
  
  const upcomingEventsCount = availableEvents.filter(e => new Date(e.date) >= new Date()).length;

  const menuItems = [
    { id: 'events', label: 'Available Events', icon: Calendar },
    { id: 'my-events', label: 'My Events', icon: Bell },
    { id: 'progress', label: 'Progress', icon: TrendingUp },
    { id: 'points-log', label: 'Points Log', icon: Award },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleMenuItemClick = (tabId: string) => {
    setActiveTab(tabId);
    setShowMobileMenu(false);
  };

  return (
    <div className="min-h-screen bg-[#F9F9F9] pb-20">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#5D2972] to-[#7a3a94] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setShowMobileMenu(true)}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-white">Welcome back!</h1>
                <p className="text-purple-100">{currentUser.name}</p>
              </div>
            </div>
            <Button variant="outline" onClick={onLogout} className="bg-white/10 border-white/20 text-white hover:bg-white/20">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">Your Points</p>
                  <p className="text-white mt-1">{points}</p>
                </div>
                <Award className="h-8 w-8 text-[#F6C85F]" />
              </div>
            </div>
            
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-purple-100">Your Level</p>
                  <p className="text-white mt-1">{level || 'No Level'}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-[#00A5B5]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Level Progress */}
      {nextLevel && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-4">
          <div className="bg-white rounded-lg p-4 border shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#333333]">Progress to {nextLevel.name}</span>
              <span className="text-[#333333]">{points} / {nextLevel.minPoints} pts</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#5D2972] to-[#00A5B5] transition-all duration-500"
                style={{ width: `${Math.min((points / nextLevel.minPoints) * 100, 100)}%` }}
              />
            </div>
            {pointsToNextLevel > 0 && (
              <p className="text-gray-500 mt-2">
                {pointsToNextLevel} points until {nextLevel.name}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-5 w-5 text-[#00A5B5]" />
              <div>
                <p className="text-gray-500">My Events</p>
                <p className="text-[#333333] mt-1">{myEvents.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center gap-2 text-gray-600">
              <Bell className="h-5 w-5 text-[#F6C85F]" />
              <div>
                <p className="text-gray-500">Available</p>
                <p className="text-[#333333] mt-1">{upcomingEventsCount}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="hidden md:grid w-full grid-cols-5">
            <TabsTrigger value="events">Available</TabsTrigger>
            <TabsTrigger value="my-events">My Events</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="points-log">Points Log</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="events">
            <EventList
              events={availableEvents}
              levels={levels}
              staffMembers={staffMembers}
              onSignUp={(eventId) => onSignUp(eventId, currentUser.id)}
              onCancelSignUp={onCancelSignUp ? (eventId) => onCancelSignUp(eventId, currentUser.id) : undefined}
              currentLevel={currentUser.level}
              isSignedUp={false}
              currentStaffId={currentUser.id}
            />
          </TabsContent>
          
          <TabsContent value="my-events">
            <EventList
              events={myEvents}
              levels={levels}
              staffMembers={staffMembers}
              onSignUp={(eventId) => onSignUp(eventId, currentUser.id)}
              onCancelSignUp={onCancelSignUp ? (eventId) => onCancelSignUp(eventId, currentUser.id) : undefined}
              currentLevel={currentUser.level}
              isSignedUp={true}
              currentStaffId={currentUser.id}
            />
          </TabsContent>
          
          <TabsContent value="progress">
            <ProgressTracker
              points={points}
              level={level}
              myEvents={myEvents}
              levels={levels}
            />
          </TabsContent>

          <TabsContent value="points-log">
            <PointsLog
              pointAdjustments={pointAdjustments}
              staffMembers={staffMembers}
              isStaffView={true}
              currentUserId={currentUser.id}
              currentUserName={currentUser.name}
            />
          </TabsContent>

          <TabsContent value="settings">
            <StaffSettings
              currentEmail={currentUser.email}
              onUpdateEmail={onUpdateEmail}
              onUpdatePassword={onUpdatePassword}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Mobile Menu */}
      <Sheet open={showMobileMenu} onOpenChange={setShowMobileMenu}>
        <SheetContent side="left" className="w-[280px]" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant={activeTab === item.id ? "default" : "ghost"}
                  className="justify-start w-full"
                  onClick={() => handleMenuItemClick(item.id)}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {item.label}
                </Button>
              );
            })}
            <div className="border-t pt-2 mt-2">
              <Button
                variant="ghost"
                className="justify-start w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => {
                  setShowMobileMenu(false);
                  onLogout();
                }}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}