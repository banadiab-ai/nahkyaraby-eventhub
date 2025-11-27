import { useState } from 'react';
import { LogOut, Calendar, Users, Settings, RotateCcw, Menu } from 'lucide-react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { EventManagement } from './EventManagement';
import { StaffManagement } from './StaffManagement';
import { StaffingOverview } from './StaffingOverview';
import { AdminSettings, Level } from './AdminSettings';
import { NotificationDebug } from './NotificationDebug';
import { PointsLog } from './PointsLog';
import { InstructionsTab } from './InstructionsTab';
import { Event, StaffMember, User, PointAdjustment } from '../App';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

// Admin Dashboard Component
interface AdminDashboardProps {
  events: Event[];
  staffMembers: StaffMember[];
  pointAdjustments: PointAdjustment[];
  levels: Level[];
  adminEmail: string;
  adminPhone: string;
  onAddEvent: (event: Omit<Event, 'id' | 'signedUpStaff' | 'createdAt'>) => void;
  onUpdateEvent: (eventId: string, event: Omit<Event, 'id' | 'signedUpStaff' | 'createdAt'>) => void;
  onCancelEvent: (eventId: string) => void;
  onReinstateEvent: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onAddStaff: (email: string, name: string, phone: string) => StaffMember | null;
  onUpdateStaff: (staffId: string, name: string, email: string, phone: string, level: string, telegramUsername: string) => void;
  onDeleteStaff: (staffId: string) => void;
  onUpdateStaffStatus: (staffId: string, status: 'active' | 'inactive') => void;
  onAdjustPoints: (staffId: string, pointsChange: number, reason: string) => void;
  onSendPasswordReset: (staffId: string) => void;
  onSendTelegramTest: (staffId: string) => void;
  onConfirmParticipation: (eventId: string, staffId: string) => void;
  onConfirmAllParticipants: (eventId: string) => void;
  onCloseEvent: (eventId: string, approvedStaffIds: string[]) => void;
  onAdminSignUpStaff: (eventId: string, staffIds: string[]) => void;
  onSaveAdminSettings: (email: string, phone: string) => Promise<void>;
  onUpdateCurrentUser: (updates: Partial<User>) => void;
  onAddLevel: (name: string, minPoints: number) => Promise<void>;
  onUpdateLevel: (levelId: string, name: string, minPoints: number) => Promise<void>;
  onDeleteLevel: (levelId: string) => Promise<void>;
  onReorderLevel: (levelId: string, direction: 'up' | 'down') => Promise<void>;
  onWhatsAppConnect: (phoneNumberId: string, accessToken: string) => Promise<void>;
  whatsAppConnected: boolean;
  whatsAppPhoneNumber?: string;
  onTelegramConnect: (botToken: string) => Promise<void>;
  telegramConnected: boolean;
  telegramBotName?: string;
  onLogout: () => void;
  onResetData: () => void;
  currentUser: User;
}

export function AdminDashboard({
  events,
  staffMembers,
  pointAdjustments,
  levels,
  adminEmail,
  adminPhone,
  onAddEvent,
  onUpdateEvent,
  onCancelEvent,
  onReinstateEvent,
  onDeleteEvent,
  onAddStaff,
  onUpdateStaff,
  onDeleteStaff,
  onUpdateStaffStatus,
  onAdjustPoints,
  onSendPasswordReset,
  onSendTelegramTest,
  onConfirmParticipation,
  onConfirmAllParticipants,
  onCloseEvent,
  onAdminSignUpStaff,
  onSaveAdminSettings,
  onUpdateCurrentUser,
  onAddLevel,
  onUpdateLevel,
  onDeleteLevel,
  onReorderLevel,
  onWhatsAppConnect,
  whatsAppConnected,
  whatsAppPhoneNumber,
  onTelegramConnect,
  telegramConnected,
  telegramBotName,
  onLogout,
  onResetData,
  currentUser
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState('events');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const totalStaff = staffMembers.length;
  const activeStaff = staffMembers.filter(s => s.status === 'active').length;
  const upcomingEvents = events.filter(e => new Date(e.date) >= new Date()).length;
  const totalSignups = events.reduce((acc, event) => acc + (event.signedUpStaff?.length || 0), 0);

  const menuItems = [
    { id: 'events', label: 'Events', icon: Calendar },
    { id: 'staff', label: 'Staff', icon: Users },
    { id: 'overview', label: 'Overview', icon: Calendar },
    { id: 'points', label: 'Points Log', icon: Calendar },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'instructions', label: 'Instructions', icon: Calendar },
  ];

  const handleMenuItemClick = (tabId: string) => {
    setActiveTab(tabId);
    setShowMobileMenu(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setShowMobileMenu(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-gray-900">Admin Dashboard</h1>
                <p className="text-gray-500">{currentUser.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Slide-in Menu */}
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

      {/* Stats Overview */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500">Total Staff</p>
                <p className="text-gray-900 mt-1">{totalStaff}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-500">Upcoming Events</p>
                <p className="text-gray-900 mt-1">{upcomingEvents}</p>
              </div>
              <Calendar className="h-8 w-8 text-purple-500" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="hidden md:grid w-full grid-cols-6 mb-6">
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="points">Points Log</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="instructions">Instructions</TabsTrigger>
          </TabsList>
          
          <TabsContent value="events">
            <EventManagement
              events={events}
              levels={levels}
              staffMembers={staffMembers}
              onAddEvent={onAddEvent}
              onUpdateEvent={onUpdateEvent}
              onCancelEvent={onCancelEvent}
              onReinstateEvent={onReinstateEvent}
              onDeleteEvent={onDeleteEvent}
              onCloseEvent={onCloseEvent}
              onAdminSignUpStaff={onAdminSignUpStaff}
            />
          </TabsContent>
          
          <TabsContent value="staff">
            <StaffManagement
              staffMembers={staffMembers}
              levels={levels}
              onAddStaff={onAddStaff}
              onUpdateStaff={onUpdateStaff}
              onDeleteStaff={onDeleteStaff}
              onUpdateStaffStatus={onUpdateStaffStatus}
              onAdjustPoints={onAdjustPoints}
              onSendPasswordReset={onSendPasswordReset}
              onSendTelegramTest={onSendTelegramTest}
            />
          </TabsContent>
          
          <TabsContent value="settings">
            <div className="space-y-6">
              <AdminSettings
              onSave={onSaveAdminSettings}
              onUpdateCurrentUser={onUpdateCurrentUser}
              initialEmail={adminEmail}
              initialPhone={adminPhone}
              levels={levels}
              onAddLevel={onAddLevel}
              onUpdateLevel={onUpdateLevel}
              onDeleteLevel={onDeleteLevel}
              onReorderLevel={onReorderLevel}
              onWhatsAppConnect={onWhatsAppConnect}
              whatsAppConnected={whatsAppConnected}
              whatsAppPhoneNumber={whatsAppPhoneNumber}
              onTelegramConnect={onTelegramConnect}
              telegramConnected={telegramConnected}
              telegramBotName={telegramBotName}
              />
              <NotificationDebug />
            </div>
          </TabsContent>
          
          <TabsContent value="overview">
            <StaffingOverview
              events={events}
              staffMembers={staffMembers}
              onConfirmParticipation={onConfirmParticipation}
              onConfirmAllParticipants={onConfirmAllParticipants}
              onCloseEvent={onCloseEvent}
              onAdminSignUpStaff={onAdminSignUpStaff}
            />
          </TabsContent>

          <TabsContent value="points">
            <PointsLog
              pointAdjustments={pointAdjustments}
              staffMembers={staffMembers}
            />
          </TabsContent>

          <TabsContent value="instructions">
            <InstructionsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Reset Data Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all events, staff members, and point adjustments. 
              The application will return to its initial demo state. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onResetData();
                setShowResetDialog(false);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Reset All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}