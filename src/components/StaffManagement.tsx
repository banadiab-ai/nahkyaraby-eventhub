import { useState } from 'react';
import { Plus, Mail, Award, TrendingUp, TrendingDown, UserPlus, AlertCircle, Edit2, Phone, KeyRound, Trash2, Copy, CheckCircle, Send, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './ui/alert-dialog';
import { Badge } from './ui/badge';
import { StaffMember } from '../App';
import { Alert, AlertDescription } from './ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Level } from './AdminSettings';
import { api } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import { projectId } from '../utils/supabase/info';

interface StaffManagementProps {
  staffMembers: StaffMember[];
  levels: Level[];
  onAddStaff: (email: string, name: string, phone: string) => StaffMember;
  onUpdateStaff: (staffId: string, name: string, email: string, phone: string, level: string, telegramUsername: string) => void;
  onDeleteStaff: (staffId: string) => void;
  onAdjustPoints: (staffId: string, pointsChange: number, reason: string) => void;
  onSendPasswordReset: (staffId: string) => void;
  onSendTelegramTest: (staffId: string) => void;
  onUpdateStaffStatus: (staffId: string, status: 'active' | 'inactive') => void;
}

export function StaffManagement({ staffMembers, levels, onAddStaff, onUpdateStaff, onDeleteStaff, onAdjustPoints, onSendPasswordReset, onSendTelegramTest, onUpdateStaffStatus }: StaffManagementProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [addFormData, setAddFormData] = useState({ email: '', name: '', phone: '' });
  const [editFormData, setEditFormData] = useState({ email: '', name: '', phone: '', level: '', telegramUsername: '' });
  const [adjustFormData, setAdjustFormData] = useState({ points: '', reason: '' });
  const [lastInvitation, setLastInvitation] = useState<string | null>(null);
  const [resetPasswordSent, setResetPasswordSent] = useState<string | null>(null);
  const [manualInviteInfo, setManualInviteInfo] = useState<any>(null);
  const [manualResetInfo, setManualResetInfo] = useState<any>(null);
  const [isChatIdDialogOpen, setIsChatIdDialogOpen] = useState(false);
  const [recentChats, setRecentChats] = useState<any[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);

  // Safe clipboard copy with fallback
  const copyToClipboard = async (text: string, button: HTMLButtonElement) => {
    let copySuccessful = false;
    
    // Try modern Clipboard API first
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        copySuccessful = true;
      }
    } catch (clipboardError) {
      // Clipboard API failed, will try fallback
      console.log('Clipboard API failed, using fallback method');
    }
    
    // Fallback method if clipboard API failed or is not available
    if (!copySuccessful) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        textArea.remove();
        
        if (successful) {
          copySuccessful = true;
        }
      } catch (fallbackError) {
        console.error('Fallback copy failed:', fallbackError);
      }
    }
    
    // Show feedback
    const originalText = button.innerHTML;
    if (copySuccessful) {
      button.innerHTML = '✓ Copied!';
      setTimeout(() => {
        if (button) button.innerHTML = originalText;
      }, 2000);
    } else {
      button.innerHTML = '⚠ Select & Copy';
      setTimeout(() => {
        if (button) button.innerHTML = originalText;
      }, 2000);
    }
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    const newStaff = await onAddStaff(addFormData.email, addFormData.name, addFormData.phone);
    
    // Check if email failed and there's manual invite info
    const failedInvite = sessionStorage.getItem('lastFailedInvite');
    if (failedInvite) {
      const inviteData = JSON.parse(failedInvite);
      setManualInviteInfo(inviteData);
      sessionStorage.removeItem('lastFailedInvite');
    } else {
      setLastInvitation(addFormData.email);
      // Clear invitation message after 10 seconds
      setTimeout(() => setLastInvitation(null), 10000);
    }
    
    setAddFormData({ email: '', name: '', phone: '' });
    setIsAddDialogOpen(false);
  };

  const handleEditStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStaff) {
      // Validate Telegram Chat ID if provided
      if (editFormData.telegramUsername && !/^\d+$/.test(editFormData.telegramUsername)) {
        toast.error('Invalid Chat ID', {
          description: 'Telegram Chat ID must be numeric only (e.g., 123456789), not a username.',
        });
        return;
      }

      console.log('Saving staff edit...');
      console.log('editFormData.level:', editFormData.level, 'Type:', typeof editFormData.level);
      console.log('Available levels:', levels);

      // Convert level ID back to level name for the API
      // Handle both string and number comparison
      const levelObj = levels.find(l => String(l.id) === String(editFormData.level));
      const levelName = levelObj?.name || editFormData.level;

      console.log('Found level object:', levelObj);
      console.log('Level name to send:', levelName);

      onUpdateStaff(
        selectedStaff.id,
        editFormData.name,
        editFormData.email,
        editFormData.phone,
        levelName, // Use the level name, not ID
        editFormData.telegramUsername
      );
      setIsEditDialogOpen(false);
      setSelectedStaff(null);
      setEditFormData({ email: '', name: '', phone: '', level: '', telegramUsername: '' });
    }
  };

  const openEditDialog = (staff: StaffMember) => {
    setSelectedStaff(staff);
    console.log('Opening edit dialog for staff:', staff.name);
    console.log('Staff level:', staff.level, 'Type:', typeof staff.level);
    console.log('Available levels:', levels);
    
    // The staff.level might be a number (legacy), level name, or level ID
    let levelId = '';
    
    // Check if it's a numeric value (either number or string that represents a number)
    const isNumeric = typeof staff.level === 'number' || (typeof staff.level === 'string' && /^\d+$/.test(staff.level));
    
    if (isNumeric) {
      // Legacy: level is stored as a number or numeric string (1, 2, 3, "1", "2", "3")
      // Find level by order number
      const orderNum = typeof staff.level === 'number' ? staff.level : parseInt(staff.level);
      const levelObj = levels.find(l => l.order === orderNum);
      // Convert ID to string to ensure consistency with Select component
      levelId = levelObj?.id ? String(levelObj.id) : '';
      console.log('Staff has numeric level (order:', orderNum, '), found by order:', levelObj);
    } else if (staff.level) {
      // Modern: level is stored as name or ID
      // First try to find by ID (try both string and number comparison)
      let levelObj = levels.find(l => l.id === staff.level || String(l.id) === String(staff.level));
      
      // If not found, try to find by name
      if (!levelObj) {
        levelObj = levels.find(l => l.name === staff.level);
      }
      
      // Convert ID to string to ensure consistency with Select component
      levelId = levelObj?.id ? String(levelObj.id) : '';
      console.log('Staff has string level, found level object:', levelObj);
    }
    
    console.log('Final levelId to use:', levelId, 'Type:', typeof levelId);
    
    setEditFormData({ 
      email: staff.email, 
      name: staff.name, 
      phone: staff.phone || '', 
      level: levelId,
      telegramUsername: staff.telegramChatId || staff.telegramUsername || ''
    });
    setIsEditDialogOpen(true);
  };

  const handleAdjustPoints = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStaff) {
      onAdjustPoints(selectedStaff.id, parseInt(adjustFormData.points), adjustFormData.reason);
      setAdjustFormData({ points: '', reason: '' });
      setIsAdjustDialogOpen(false);
      setSelectedStaff(null);
    }
  };

  const openAdjustDialog = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setIsAdjustDialogOpen(true);
  };

  const handleSendPasswordReset = async (staff: StaffMember) => {
    await onSendPasswordReset(staff.id);
    
    // Check if password reset failed and there's manual reset info
    const failedReset = sessionStorage.getItem('lastFailedReset');
    if (failedReset) {
      const resetData = JSON.parse(failedReset);
      setManualResetInfo(resetData);
      sessionStorage.removeItem('lastFailedReset');
    } else {
      setResetPasswordSent(staff.email);
      // Clear reset message after 10 seconds
      setTimeout(() => setResetPasswordSent(null), 10000);
    }
  };

  const openDeleteDialog = (staff: StaffMember) => {
    setSelectedStaff(staff);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteStaff = () => {
    if (selectedStaff) {
      onDeleteStaff(selectedStaff.id);
      setIsDeleteDialogOpen(false);
      setSelectedStaff(null);
    }
  };

  const fetchRecentChats = async () => {
    setLoadingChats(true);
    try {
      const result = await api.getTelegramRecentChats();
      if (result.success) {
        setRecentChats(result.chats || []);
        setIsChatIdDialogOpen(true);
        if (result.chats.length === 0) {
          toast.info('No recent conversations found', {
            description: 'Ask staff members to message your Telegram bot first'
          });
        }
      }
    } catch (error: any) {
      console.error('Error fetching recent chats:', error);
      toast.error(error.message || 'Failed to fetch recent chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const selectChatId = (chatId: string) => {
    setEditFormData({ ...editFormData, telegramUsername: chatId });
    setIsChatIdDialogOpen(false);
    toast.success('Chat ID selected', {
      description: `Don't forget to save the changes`
    });
  };

  const testChatId = async (chatId: string) => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/telegram/test-chat-id`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api.getAccessToken()}`,
          },
          body: JSON.stringify({
            chatId: chatId,
            name: selectedStaff?.name,
          }),
        }
      );

      const result = await response.json();

      if (result.success || response.ok) {
        toast.success('✅ Chat ID is valid!', {
          description: `Test message sent successfully. The staff member should have received it.`,
        });
      } else {
        throw new Error(result.error || 'Failed to send test message');
      }
    } catch (error: any) {
      console.error('Error testing Chat ID:', error);
      
      let errorDescription = error.message || 'Could not send message to this Chat ID';
      
      // Provide helpful suggestions based on error type
      if (error.message?.toLowerCase().includes('chat not found')) {
        errorDescription = `${selectedStaff?.name} hasn't started a conversation with your bot yet. Ask them to message your bot first.`;
      } else if (error.message?.toLowerCase().includes('blocked')) {
        errorDescription = `${selectedStaff?.name} has blocked your bot. Ask them to unblock it in Telegram.`;
      }
      
      toast.error('❌ Chat ID test failed', {
        description: errorDescription,
        duration: 7000,
      });
    }
  };

  const testChatIdDirectly = async () => {
    if (!editFormData.telegramUsername) {
      toast.error('Please enter a Chat ID first');
      return;
    }

    if (!selectedStaff) {
      toast.error('No staff member selected');
      return;
    }

    const loadingToast = toast.loading('Testing Chat ID...');

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/server/telegram/test-chat-id`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${api.getAccessToken()}`,
          },
          body: JSON.stringify({
            chatId: editFormData.telegramUsername,
            name: selectedStaff.name,
          }),
        }
      );

      const result = await response.json();

      toast.dismiss(loadingToast);

      if (result.success || response.ok) {
        toast.success('✅ Chat ID is valid!', {
          description: `Test message sent successfully. The staff member should have received it.`,
        });
      } else {
        throw new Error(result.error || 'Failed to send test message');
      }
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('Error testing Chat ID:', error);
      
      let errorDescription = error.message || 'Could not send message to this Chat ID';
      
      // Provide helpful suggestions based on error type
      if (error.message?.toLowerCase().includes('chat not found')) {
        errorDescription = `${selectedStaff.name} hasn't started a conversation with your bot yet. Ask them to message your bot first.`;
      } else if (error.message?.toLowerCase().includes('blocked')) {
        errorDescription = `${selectedStaff.name} has blocked your bot. Ask them to unblock it in Telegram.`;
      }
      
      toast.error('❌ Chat ID test failed', {
        description: errorDescription,
        duration: 7000,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-gray-900">Staff Management</h2>
          <p className="text-gray-500">Manage staff members and adjust performance points</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-2" />
              Add Staff Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite New Staff Member</DialogTitle>
              <DialogDescription>
                Enter the staff member's details. They will receive an email with login credentials and will be required to set up a new password on first login.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddStaff} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={addFormData.name}
                  onChange={(e) => setAddFormData({ ...addFormData, name: e.target.value })}
                  placeholder="e.g., John Smith"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={addFormData.email}
                  onChange={(e) => setAddFormData({ ...addFormData, email: e.target.value })}
                  placeholder="john.smith@company.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={addFormData.phone}
                  onChange={(e) => setAddFormData({ ...addFormData, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              <Button type="submit" className="w-full">
                <Mail className="h-4 w-4 mr-2" />
                Send Invitation
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {lastInvitation && (
        <Alert>
          <Mail className="h-4 w-4" />
          <AlertDescription>
            ✅ Invitation email sent to {lastInvitation}! They will receive login credentials and will be required to set up a new password on first login.
          </AlertDescription>
        </Alert>
      )}

      {resetPasswordSent && (
        <Alert>
          <KeyRound className="h-4 w-4" />
          <AlertDescription>
            Password reset email sent to {resetPasswordSent}. They will receive a temporary password and will be required to set up a new password on next login.
          </AlertDescription>
        </Alert>
      )}

      {/* Manual Invitation Info */}
      {manualInviteInfo && (
        <Alert className="bg-blue-50 border-blue-300">
          <Mail className="h-4 w-4 text-blue-600" />
          <AlertDescription>
            <div className="space-y-3">
              <div>
                <strong className="text-blue-900">✅ {manualInviteInfo.staff.name} was created successfully!</strong>
                <p className="text-blue-800 mt-1 text-sm">
                  The invitation email couldn't be sent automatically (Resend is in testing mode). 
                  Please share the login credentials below with the staff member.
                </p>
              </div>
              
              <div className="bg-white rounded-md p-3 border border-blue-200 space-y-3">
                <p className="text-sm font-medium text-gray-900">📋 Share these login credentials:</p>
                
                <div>
                  <p className="text-xs text-gray-600 mb-1">Username (Email):</p>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      readOnly 
                      value={manualInviteInfo.staff.email}
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-md font-mono"
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        copyToClipboard(manualInviteInfo.staff.email, btn);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <p className="text-xs text-gray-600 mb-1">Temporary Password:</p>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      readOnly 
                      value={manualInviteInfo.tempPassword}
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-md font-mono"
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        copyToClipboard(manualInviteInfo.tempPassword, btn);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                  <p className="text-xs text-yellow-800">
                    ⚠️ <strong>Important:</strong> The staff member will be required to set up a new password when they first log in.
                  </p>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <p className="text-xs text-blue-700">
                  💡 <strong>Pro tip:</strong> For automatic email delivery, verify your domain at{' '}
                  <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    resend.com/domains
                  </a>
                </p>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setManualInviteInfo(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Manual Password Reset Info */}
      {manualResetInfo && (
        <Alert className="bg-orange-50 border-orange-300">
          <KeyRound className="h-4 w-4 text-orange-600" />
          <AlertDescription>
            <div className="space-y-3">
              <div>
                <strong className="text-orange-900">🔑 Password reset successful for {manualResetInfo.staff.name}</strong>
                <p className="text-orange-800 mt-1 text-sm">
                  The password reset email couldn't be sent automatically (Resend is in testing mode). 
                  Please share the temporary password below with the staff member.
                </p>
              </div>
              
              <div className="bg-white rounded-md p-3 border border-orange-200 space-y-3">
                <p className="text-sm font-medium text-gray-900">📋 Share these login credentials:</p>
                
                <div>
                  <p className="text-xs text-gray-600 mb-1">Username (Email):</p>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      readOnly 
                      value={manualResetInfo.staff.email}
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-md font-mono"
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        copyToClipboard(manualResetInfo.staff.email, btn);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div>
                  <p className="text-xs text-gray-600 mb-1">Temporary Password:</p>
                  <div className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      readOnly 
                      value={manualResetInfo.tempPassword}
                      className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-md font-mono"
                      onClick={(e) => e.currentTarget.select()}
                    />
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        const btn = e.currentTarget as HTMLButtonElement;
                        copyToClipboard(manualResetInfo.tempPassword, btn);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                  <p className="text-xs text-yellow-800">
                    ⚠️ <strong>Important:</strong> The staff member will be required to set up a new password when they log in with this temporary password.
                  </p>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <p className="text-xs text-orange-700">
                  💡 <strong>Pro tip:</strong> For automatic email delivery, verify your domain at{' '}
                  <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                    resend.com/domains
                  </a>
                </p>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setManualResetInfo(null)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Edit Staff Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Staff Member</DialogTitle>
            <DialogDescription>
              Update staff member information and level.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditStaff} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email Address</Label>
              <Input
                id="edit-email"
                type="email"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone Number</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={editFormData.phone}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="edit-telegram">Telegram Chat ID</Label>
                  {editFormData.telegramUsername && (
                    /^\d+$/.test(editFormData.telegramUsername) ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                        ✓ Valid format
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                        ✗ Invalid
                      </Badge>
                    )
                  )}
                </div>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-auto p-0 text-blue-600 hover:text-blue-700">
                      <Info className="h-4 w-4 mr-1" />
                      How to get Chat ID?
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>📱 How to Get Telegram Chat ID</DialogTitle>
                      <DialogDescription>
                        Follow these steps to get a staff member's Telegram Chat ID
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Alert className="bg-blue-50 border-blue-200">
                        <Info className="h-4 w-4 text-blue-600" />
                        <AlertDescription className="text-blue-900">
                          <strong>Important:</strong> The staff member must first start a conversation with your Telegram bot before you can send them messages.
                        </AlertDescription>
                      </Alert>
                      
                      <div className="space-y-3">
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                            1
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Staff member starts the bot</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              The staff member needs to open Telegram, search for your bot by name, and send any message to start the conversation (e.g., "/start" or "Hello").
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                            2
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Get Chat ID from @userinfobot</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              The staff member should:
                            </p>
                            <ul className="list-disc ml-5 mt-1 text-sm text-gray-600 space-y-1">
                              <li>Search for <strong>@userinfobot</strong> on Telegram</li>
                              <li>Send any message to the bot</li>
                              <li>The bot will reply with their user information including the <strong>Chat ID</strong> (a numeric ID like 123456789)</li>
                            </ul>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                            3
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Enter Chat ID here</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              Copy the numeric Chat ID and paste it in the "Telegram Chat ID" field above.
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-semibold">
                            ✓
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900">Test the connection</h4>
                            <p className="text-sm text-gray-600 mt-1">
                              Use the "Test Connection" button to verify the Chat ID works before saving.
                            </p>
                          </div>
                        </div>
                      </div>

                      <Alert className="bg-amber-50 border-amber-200 mt-4">
                        <Info className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-amber-900">
                          <p className="font-medium mb-2">✅ Valid Chat ID Example:</p>
                          <div className="bg-white px-3 py-2 rounded border border-amber-300 font-mono text-green-700 mb-3">
                            123456789
                          </div>
                          <p className="font-medium mb-2">❌ Invalid Examples:</p>
                          <div className="space-y-1 mb-3">
                            <div className="bg-white px-3 py-2 rounded border border-red-300 font-mono text-red-700 line-through">
                              @spacecowboydxb
                            </div>
                            <div className="bg-white px-3 py-2 rounded border border-red-300 font-mono text-red-700 line-through">
                              spacecowboydxb
                            </div>
                          </div>
                          <p className="font-medium mb-2">Common Issues:</p>
                          <ul className="text-sm space-y-1 list-disc ml-5">
                            <li><strong>"Chat not found"</strong> - The user hasn't messaged your bot yet</li>
                            <li><strong>"Bot was blocked"</strong> - The user blocked your bot in Telegram</li>
                            <li><strong>Using username</strong> - Must use numeric ID, not @username</li>
                          </ul>
                          <p className="text-sm mt-2">
                            💡 <strong>Best Practice:</strong> Use the "Fetch from Bot" button to automatically get the correct numeric Chat IDs!
                          </p>
                        </AlertDescription>
                      </Alert>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      id="edit-telegram"
                      value={editFormData.telegramUsername}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        setEditFormData({ ...editFormData, telegramUsername: value });
                      }}
                      placeholder="123456789"
                      className="flex-1"
                      type="text"
                      inputMode="numeric"
                    />
                    {editFormData.telegramUsername && !/^\d+$/.test(editFormData.telegramUsername) && (
                      <p className="text-xs text-red-600 mt-1 font-medium">
                        ⚠️ Chat ID must be numeric only (not a username like @user)
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={fetchRecentChats}
                    disabled={loadingChats}
                  >
                    {loadingChats ? 'Loading...' : 'Fetch from Bot'}
                  </Button>
                </div>
                {editFormData.telegramUsername && /^\d+$/.test(editFormData.telegramUsername) && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={testChatIdDirectly}
                    className="w-full"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Test Connection
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-level">Level</Label>
              <Select
                value={editFormData.level || 'no-level'}
                onValueChange={(value) => {
                  const actualValue = value === 'no-level' ? '' : value;
                  console.log('Level selected:', value, 'Actual value:', actualValue, 'Type:', typeof actualValue);
                  console.log('Current editFormData.level:', editFormData.level, 'Type:', typeof editFormData.level);
                  console.log('All level IDs:', levels.map(l => ({ id: l.id, idType: typeof l.id, name: l.name })));
                  setEditFormData({ ...editFormData, level: actualValue });
                  console.log('After update, editFormData.level will be:', actualValue, 'Type:', typeof actualValue);
                }}
              >
                <SelectTrigger id="edit-level">
                  <SelectValue placeholder="Select level">
                    {editFormData.level 
                      ? levels.find(l => String(l.id) === String(editFormData.level))?.name || 'Unknown Level'
                      : 'No Level Assigned'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no-level">
                    <span className="text-gray-400">No Level Assigned</span>
                  </SelectItem>
                  {Array.from(new Map(levels.map(level => [level.id, level])).values())
                    .sort((a, b) => a.order - b.order)
                    .map(level => (
                      <SelectItem key={level.id} value={String(level.id)}>
                        {level.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-gray-500 text-sm">
                Current points: {selectedStaff?.points}
              </p>
            </div>

            {editFormData.telegramUsername && !/^\d+$/.test(editFormData.telegramUsername) && (
              <Alert variant="destructive">
                <AlertDescription className="flex items-center gap-2">
                  <span>⚠️</span>
                  <div>
                    <p className="font-medium">Cannot save with invalid Chat ID</p>
                    <p className="text-sm">Please enter a numeric Chat ID (e.g., 123456789) or use "Fetch from Bot"</p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full"
              disabled={editFormData.telegramUsername ? !/^\d+$/.test(editFormData.telegramUsername) : false}
            >
              Save Changes
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Points Dialog */}
      <Dialog open={isAdjustDialogOpen} onOpenChange={setIsAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Points for {selectedStaff?.name}</DialogTitle>
            <DialogDescription>
              Add or deduct points based on performance, punctuality, or other metrics.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdjustPoints} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="points">Points Change</Label>
              <Input
                id="points"
                type="number"
                value={adjustFormData.points}
                onChange={(e) => setAdjustFormData({ ...adjustFormData, points: e.target.value })}
                placeholder="Use positive to add, negative to deduct (e.g., 50 or -25)"
                required
              />
              <p className="text-gray-500">Current points: {selectedStaff?.points}</p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Input
                id="reason"
                value={adjustFormData.reason}
                onChange={(e) => setAdjustFormData({ ...adjustFormData, reason: e.target.value })}
                placeholder="e.g., Outstanding performance, Late arrival"
                required
              />
            </div>

            <Button type="submit" className="w-full">
              Confirm Adjustment
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Staff Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedStaff?.name}? This action cannot be undone. 
              The staff member will be removed from all events and permanently deleted from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStaff}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chat ID Selection Dialog */}
      <Dialog open={isChatIdDialogOpen} onOpenChange={setIsChatIdDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Select Telegram Chat ID</span>
              {recentChats.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      const result = await api.clearTelegramUpdates();
                      if (result.success) {
                        toast.success('Updates cleared', {
                          description: 'Ask staff to message the bot again, then click "Fetch from Bot"'
                        });
                        setRecentChats([]);
                        setIsChatIdDialogOpen(false);
                      }
                    } catch (error: any) {
                      toast.error(error.message || 'Failed to clear updates');
                    }
                  }}
                >
                  Clear Old Messages
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              {recentChats.length > 0 
                ? 'Click on a user to select their Chat ID' 
                : 'No recent conversations found. Ask staff members to message your bot first.'}
            </DialogDescription>
          </DialogHeader>
          {recentChats.length > 0 && (
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-blue-900">
                These are users who have messaged your Telegram bot. Click on a user to auto-fill their Chat ID.
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-3 overflow-y-auto max-h-[400px]">
            {recentChats.length === 0 ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <div>
                    <p className="font-medium mb-2">No recent conversations found</p>
                    <p className="text-sm">Ask staff members to:</p>
                    <ol className="list-decimal ml-5 mt-2 text-sm space-y-1">
                      <li>Open Telegram and search for your bot</li>
                      <li>Send any message to start a conversation (e.g., "/start")</li>
                      <li>Then click "Fetch from Bot" again</li>
                    </ol>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              recentChats.map((chat) => (
                <Card 
                  key={chat.chatId} 
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => selectChatId(chat.chatId)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">
                            {chat.firstName} {chat.lastName}
                          </p>
                          {chat.username && (
                            <Badge variant="outline" className="text-xs">
                              {chat.username}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          Chat ID: <span className="font-mono font-medium">{chat.chatId}</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Last message: {chat.lastMessage}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(chat.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <Button size="sm" variant="outline">
                        Select
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Staff List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {staffMembers.map(staff => (
          <Card key={staff.id}>
            <CardHeader>
              <CardTitle className="flex items-start justify-between">
                <div className="flex-1">
                  <div>{staff.name}</div>
                  <p className="text-gray-500 mt-1 flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {staff.email}
                  </p>
                  {staff.phone && (
                    <p className="text-gray-500 mt-1 flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {staff.phone}
                    </p>
                  )}
                  {(staff.telegramChatId || staff.telegramUsername) && (
                    <p className="text-gray-500 mt-1 flex items-center gap-1">
                      <Send className="h-3 w-3" />
                      Telegram: {staff.telegramChatId || staff.telegramUsername}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {staff.status === 'active' ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                      Active
                    </Badge>
                  ) : staff.status === 'pending' ? (
                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                      Pending
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
                      Inactive
                    </Badge>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Status Toggle - Only for non-pending staff */}
              {staff.status !== 'pending' && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`status-${staff.id}`} className="cursor-pointer">
                      {(staff.status || 'active') === 'active' ? 'Active' : 'Inactive'}
                    </Label>
                  </div>
                  <Switch
                    id={`status-${staff.id}`}
                    checked={(staff.status || 'active') === 'active'}
                    onCheckedChange={(checked) => {
                      const newStatus = checked ? 'active' : 'inactive';
                      onUpdateStaffStatus(staff.id, newStatus);
                    }}
                  />
                </div>
              )}
              
              <div className="flex items-center justify-between">
                <div className="flex items-center text-gray-600">
                  <Award className="h-4 w-4 mr-2" />
                  {staff.points} points
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                  {staff.level || 'No Level'}
                </Badge>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => openEditDialog(staff)}
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                {staff.status === 'active' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openAdjustDialog(staff)}
                  >
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Points
                  </Button>
                )}
              </div>
              
              {staff.status === 'active' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleSendPasswordReset(staff)}
                >
                  <KeyRound className="h-4 w-4 mr-2" />
                  Send Password Reset
                </Button>
              )}
              
              {staff.status === 'active' && (staff.telegramChatId || staff.telegramUsername) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  onClick={() => onSendTelegramTest(staff.id)}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Telegram Test
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => openDeleteDialog(staff)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Staff
              </Button>
              
              {staff.status === 'pending' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Awaiting account setup
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}