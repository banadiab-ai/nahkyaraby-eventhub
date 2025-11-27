import { useState, useEffect } from 'react';
import { Save, Mail, Phone, Plus, Trash2, Edit2, Check, X, GripVertical, AlertCircle, ArrowUp, ArrowDown, MessageCircle, Link as LinkIcon, Send as SendIcon, Key, Users, CheckCircle2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { toast } from 'sonner@2.0.3';
import { api } from '../utils/api';
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { supabase } from '../utils/supabase';

export interface Level {
  id: string;
  name: string;
  minPoints: number;
  order: number;
}

interface AdminSettingsProps {
  onSave: (email: string, phone: string) => Promise<void>;
  onUpdateCurrentUser: (updates: Partial<{ id: string; email: string; role: string; name: string; points?: number; level?: string }>) => void;
  initialEmail?: string;
  initialPhone?: string;
  levels: Level[];
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
}

export function AdminSettings({ onSave, onUpdateCurrentUser, initialEmail = '', initialPhone = '', levels, onAddLevel, onUpdateLevel, onDeleteLevel, onReorderLevel, onWhatsAppConnect, whatsAppConnected, whatsAppPhoneNumber, onTelegramConnect, telegramConnected, telegramBotName }: AdminSettingsProps) {
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [isSaving, setIsSaving] = useState(false);
  
  // Levels state
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newLevel, setNewLevel] = useState({ name: '', minPoints: '' });
  const [editLevel, setEditLevel] = useState({ name: '', minPoints: '' });
  
  // Sort levels by order (lower order = higher in hierarchy)
  const sortedLevels = [...(levels || [])].sort((a, b) => a.order - b.order);

  // WhatsApp state
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [whatsAppPhoneNumberId, setWhatsAppPhoneNumberId] = useState('');
  const [whatsAppAccessToken, setWhatsAppAccessToken] = useState('');
  const [isConnectingWhatsApp, setIsConnectingWhatsApp] = useState(false);

  // Telegram state
  const [showTelegramDialog, setShowTelegramDialog] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [isConnectingTelegram, setIsConnectingTelegram] = useState(false);

  // Debug state
  const [showDebugDialog, setShowDebugDialog] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [isLoadingDebug, setIsLoadingDebug] = useState(false);

  // Email config state
  const [fromEmail, setFromEmail] = useState('info@nahkyaraby.com');
  const [isTestMode, setIsTestMode] = useState(true);
  const [isLoadingEmailConfig, setIsLoadingEmailConfig] = useState(true);

  // Credential change state
  const [showCredentialDialog, setShowCredentialDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingCredentials, setIsChangingCredentials] = useState(false);

  // Password update state
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    setEmail(initialEmail);
    setPhone(initialPhone);
  }, [initialEmail, initialPhone]);

  useEffect(() => {
    // Fetch the current email configuration from the server
    const fetchEmailConfig = async () => {
      try {
        const config = await api.getEmailConfig();
        setFromEmail(config.fromEmail);
        setIsTestMode(config.isTestMode);
      } catch (error) {
        console.error('Failed to fetch email config:', error);
        toast.error('Failed to load email configuration');
      } finally {
        setIsLoadingEmailConfig(false);
      }
    };

    fetchEmailConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      await onSave(email, phone);
      toast.success('Admin settings saved successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Levels handlers
  const handleAddLevel = async () => {
    if (!newLevel.name || !newLevel.minPoints) return;
    
    try {
      await onAddLevel(newLevel.name, parseInt(newLevel.minPoints));
      setNewLevel({ name: '', minPoints: '' });
      setIsAdding(false);
      toast.success('Level added successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to add level');
    }
  };

  const handleEditLevel = async (levelId: string) => {
    if (!editLevel.name || !editLevel.minPoints) return;
    
    try {
      await onUpdateLevel(levelId, editLevel.name, parseInt(editLevel.minPoints));
      setEditingId(null);
      setEditLevel({ name: '', minPoints: '' });
      toast.success('Level updated successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update level');
    }
  };

  const startEdit = (level: Level) => {
    setEditingId(level.id);
    setEditLevel({ name: level.name, minPoints: level.minPoints.toString() });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLevel({ name: '', minPoints: '' });
  };

  const handleDeleteLevel = async (levelId: string) => {
    try {
      await onDeleteLevel(levelId);
      setDeletingId(null);
      toast.success('Level deleted successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete level');
    }
  };

  const handleWhatsAppConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnectingWhatsApp(true);
    
    try {
      await onWhatsAppConnect(whatsAppPhoneNumberId, whatsAppAccessToken);
      toast.success('WhatsApp connected successfully!');
      setShowWhatsAppDialog(false);
      setWhatsAppPhoneNumberId('');
      setWhatsAppAccessToken('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to connect WhatsApp');
    } finally {
      setIsConnectingWhatsApp(false);
    }
  };

  const handleTelegramConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnectingTelegram(true);
    
    try {
      await onTelegramConnect(telegramBotToken);
      toast.success('Telegram connected successfully!');
      setShowTelegramDialog(false);
      setTelegramBotToken('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to connect Telegram');
    } finally {
      setIsConnectingTelegram(false);
    }
  };

  const handleLoadDebug = async () => {
    setIsLoadingDebug(true);
    try {
      const data = await api.getNotificationDebug();
      setDebugData(data);
      setShowDebugDialog(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load debug information');
    } finally {
      setIsLoadingDebug(false);
    }
  };

  const handleCredentialChange = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate passwords match
    if (newPassword && newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    // Validate at least one field is being changed
    if (!newUsername && !newPassword) {
      toast.error('Please enter a new username or password');
      return;
    }
    
    setIsChangingCredentials(true);
    
    try {
      const result = await api.changeAdminCredentials(
        currentPassword,
        newUsername || undefined,
        newPassword || undefined
      );
      
      console.log('Credential change result:', result);
      
      // Update the token if provided
      if (result.accessToken) {
        console.log('Updating access token...');
        api.setAccessToken(result.accessToken);
      }
      
      // Update the current user state via callback
      if (result.user) {
        console.log('Updating current user with new credentials:', result.user);
        onUpdateCurrentUser({
          email: result.user.email,
          name: result.user.name || result.user.username
        });
      }
      
      toast.success('Credentials updated successfully!');
      setShowCredentialDialog(false);
      setCurrentPassword('');
      setNewUsername('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Credential change error:', error);
      toast.error(error.message || 'Failed to change credentials');
    } finally {
      setIsChangingCredentials(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');
    
    try {
      // Use Supabase Auth directly to update password (same as staff)
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      
      if (error) throw error;
      
      setPasswordSuccess('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Clear success message after 5 seconds
      setTimeout(() => setPasswordSuccess(''), 5000);
    } catch (error: any) {
      console.error('Password change error:', error);
      setPasswordError(error.message || 'Failed to change password');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-gray-900">Admin Settings</h2>
        <p className="text-gray-500">Configure email settings and staff levels</p>
      </div>

      {/* Email Sender Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Sender Configuration
          </CardTitle>
          <CardDescription>
            Current email address used to send invitations and password resets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <Label className="text-sm text-gray-600 mb-2 block">Current Sender Email:</Label>
              {isLoadingEmailConfig ? (
                <div className="flex items-center gap-2">
                  <div className="bg-white px-3 py-2 rounded border border-gray-300 flex-1">
                    <span className="text-gray-400">Loading...</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <code className="bg-white px-3 py-2 rounded border border-gray-300 font-mono text-sm flex-1">
                    {fromEmail}
                  </code>
                  {isTestMode ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                      Test Mode
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                      Production
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Admin Credentials */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your admin password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                disabled={isUpdatingPassword}
                required
              />
              <p className="text-gray-500">Must be at least 6 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={isUpdatingPassword}
                required
              />
            </div>

            {passwordError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{passwordError}</AlertDescription>
              </Alert>
            )}

            {passwordSuccess && (
              <Alert className="border-green-200 bg-green-50 text-green-800">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  Password updated successfully!
                </AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              disabled={isUpdatingPassword || !newPassword || !confirmPassword}
            >
              {isUpdatingPassword ? 'Updating...' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Telegram Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SendIcon className="h-5 w-5" />
            Telegram Bot Integration
          </CardTitle>
          <CardDescription>
            Connect your Telegram bot to send event notifications via Telegram
          </CardDescription>
        </CardHeader>
        <CardContent>
          {telegramConnected ? (
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-200">
                <Check className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-900">Telegram Connected</AlertTitle>
                <AlertDescription className="text-green-800">
                  Your Telegram bot is connected and ready to send notifications.
                  {telegramBotName && (
                    <p className="mt-2">
                      <strong>Bot:</strong> @{telegramBotName}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
              <Button 
                variant="outline" 
                onClick={() => setShowTelegramDialog(true)}
                className="w-full sm:w-auto"
              >
                <SendIcon className="h-4 w-4 mr-2" />
                Update Connection
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Telegram Not Connected</AlertTitle>
                <AlertDescription>
                  Connect your Telegram bot to send event notifications directly to staff members via Telegram.
                </AlertDescription>
              </Alert>
              <Button onClick={() => setShowTelegramDialog(true)}>
                <SendIcon className="h-4 w-4 mr-2" />
                Connect Telegram Bot
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Levels Management */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Staff Levels</CardTitle>
            <CardDescription>
              Create and manage custom staff levels. Top is lowest, bottom is highest. Staff can see events at their level and all levels above.
            </CardDescription>
          </div>
          <Button onClick={() => setIsAdding(true)} disabled={isAdding} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Level
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Add New Level Form */}
            {isAdding && (
              <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-level-name">Level Name</Label>
                        <Input
                          id="new-level-name"
                          value={newLevel.name}
                          onChange={(e) => setNewLevel({ ...newLevel, name: e.target.value })}
                          placeholder="e.g., Bronze, Silver, Gold"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-level-points">Minimum Points Required</Label>
                        <Input
                          id="new-level-points"
                          type="number"
                          value={newLevel.minPoints}
                          onChange={(e) => setNewLevel({ ...newLevel, minPoints: e.target.value })}
                          placeholder="e.g., 1000"
                          min="0"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleAddLevel} size="sm">
                        <Check className="h-4 w-4 mr-2" />
                        Add Level
                      </Button>
                      <Button
                        onClick={() => {
                          setIsAdding(false);
                          setNewLevel({ name: '', minPoints: '' });
                        }}
                        variant="outline"
                        size="sm"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Levels List */}
            {sortedLevels.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-gray-500">No levels configured yet. Add your first level to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedLevels.map((level, index) => (
                  <Card key={level.id}>
                    <CardContent className="py-4">
                      {editingId === level.id ? (
                        // Edit Mode
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Level Name</Label>
                              <Input
                                value={editLevel.name}
                                onChange={(e) => setEditLevel({ ...editLevel, name: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Minimum Points</Label>
                              <Input
                                type="number"
                                value={editLevel.minPoints}
                                onChange={(e) => setEditLevel({ ...editLevel, minPoints: e.target.value })}
                                min="0"
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => handleEditLevel(level.id)} size="sm">
                              <Check className="h-4 w-4 mr-2" />
                              Save
                            </Button>
                            <Button onClick={cancelEdit} variant="outline" size="sm">
                              <X className="h-4 w-4 mr-2" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex flex-col gap-1">
                              <Button
                                onClick={() => onReorderLevel(level.id, 'up')}
                                variant="ghost"
                                size="sm"
                                disabled={index === 0}
                                className="h-6 w-6 p-0"
                              >
                                <ArrowUp className="h-3 w-3" />
                              </Button>
                              <Button
                                onClick={() => onReorderLevel(level.id, 'down')}
                                variant="ghost"
                                size="sm"
                                disabled={index === sortedLevels.length - 1}
                                className="h-6 w-6 p-0"
                              >
                                <ArrowDown className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge className="bg-blue-100 text-blue-800 border-blue-300">
                                {index === 0 ? 'Lowest' : index === sortedLevels.length - 1 ? 'Highest' : `Tier ${index + 1}`}
                              </Badge>
                              <div>
                                <p className="font-medium text-gray-900">{level.name}</p>
                                <p className="text-sm text-gray-500">
                                  {level.minPoints} points required
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => startEdit(level)}
                              variant="outline"
                              size="sm"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => setDeletingId(level.id)}
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Level?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this level? Staff members currently assigned to this level will need to be reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && handleDeleteLevel(deletingId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* WhatsApp Connection Dialog */}
      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Connect WhatsApp Business</DialogTitle>
            <DialogDescription>
              Enter your WhatsApp Business API credentials to enable WhatsApp notifications
            </DialogDescription>
          </DialogHeader>

          {/* Setup Instructions */}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-900">Setup Instructions</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-3 text-blue-800">
                <p>To connect WhatsApp Business, you'll need:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>
                    A <strong>WhatsApp Business account</strong> with Meta
                    <br />
                    <a 
                      href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1 text-sm mt-1"
                    >
                      <LinkIcon className="h-3 w-3" />
                      Get started with WhatsApp Cloud API
                    </a>
                  </li>
                  <li>
                    Your <strong>Phone Number ID</strong> from the WhatsApp Business dashboard
                  </li>
                  <li>
                    A <strong>Permanent Access Token</strong> (not a temporary token)
                  </li>
                </ol>
                <p className="text-sm mt-3">
                  <strong>Note:</strong> Make sure staff members have phone numbers in their profiles with the correct country code (e.g., +1234567890).
                </p>
              </div>
            </AlertDescription>
          </Alert>

          <form onSubmit={handleWhatsAppConnect} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">
                WhatsApp Phone Number ID <span className="text-red-500">*</span>
              </Label>
              <Input
                id="phoneNumberId"
                value={whatsAppPhoneNumberId}
                onChange={(e) => setWhatsAppPhoneNumberId(e.target.value)}
                placeholder="e.g., 123456789012345"
                required
              />
              <p className="text-gray-500 text-sm">
                Found in your WhatsApp Business dashboard under API Setup
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessToken">
                WhatsApp Access Token <span className="text-red-500">*</span>
              </Label>
              <Input
                id="accessToken"
                type="password"
                value={whatsAppAccessToken}
                onChange={(e) => setWhatsAppAccessToken(e.target.value)}
                placeholder="Enter your permanent access token"
                required
              />
              <p className="text-gray-500 text-sm">
                Generate a permanent token from your Meta App dashboard
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                type="submit" 
                disabled={isConnectingWhatsApp}
                className="flex-1"
              >
                {isConnectingWhatsApp ? 'Connecting...' : 'Connect WhatsApp'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowWhatsAppDialog(false);
                  setWhatsAppPhoneNumberId('');
                  setWhatsAppAccessToken('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Telegram Connection Dialog */}
      <Dialog open={showTelegramDialog} onOpenChange={setShowTelegramDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Connect Telegram Bot</DialogTitle>
            <DialogDescription>
              Enter your Telegram bot token to enable Telegram notifications
            </DialogDescription>
          </DialogHeader>

          {/* Setup Instructions */}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-900">Setup Instructions</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-3 text-blue-800">
                <p>To connect a Telegram bot, you'll need:</p>
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li>
                    Create a bot using <strong>@BotFather</strong> on Telegram
                    <br />
                    <a 
                      href="https://core.telegram.org/bots#how-do-i-create-a-bot" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline inline-flex items-center gap-1 text-sm mt-1"
                    >
                      <LinkIcon className="h-3 w-3" />
                      How to create a Telegram bot
                    </a>
                  </li>
                  <li>
                    Copy the <strong>bot token</strong> that @BotFather gives you
                  </li>
                  <li>
                    Each staff member will need to start a chat with your bot and provide their chat ID
                  </li>
                </ol>
                <p className="text-sm mt-3">
                  <strong>Note:</strong> Make sure staff members have their Telegram chat IDs in their profiles. They can get their chat ID by messaging your bot.
                </p>
              </div>
            </AlertDescription>
          </Alert>

          <form onSubmit={handleTelegramConnect} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="botToken">
                Bot Token <span className="text-red-500">*</span>
              </Label>
              <Input
                id="botToken"
                type="password"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder="e.g., 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                required
              />
              <p className="text-gray-500 text-sm">
                Get this from @BotFather when you create your bot
              </p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                type="submit" 
                disabled={isConnectingTelegram}
                className="flex-1"
              >
                {isConnectingTelegram ? 'Connecting...' : 'Connect Telegram'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowTelegramDialog(false);
                  setTelegramBotToken('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Credential Change Dialog */}
      <Dialog open={showCredentialDialog} onOpenChange={setShowCredentialDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Credentials</DialogTitle>
            <DialogDescription>
              Enter your current password and new credentials to update your account
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCredentialChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">
                Current Password <span className="text-red-500">*</span>
              </Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                required
              />
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                You can change your username, password, or both. Leave a field empty if you don't want to change it.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="newUsername">
                New Username (optional)
              </Label>
              <Input
                id="newUsername"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Leave empty to keep current username"
              />
              <p className="text-gray-500 text-sm">
                Username can be letters only (e.g., "admin", "manager")
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">
                New Password (optional)
              </Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Leave empty to keep current password"
              />
            </div>

            {newPassword && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">
                  Confirm Password <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  required
                />
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button 
                type="submit" 
                disabled={isChangingCredentials}
                className="flex-1"
              >
                {isChangingCredentials ? 'Changing...' : 'Change Credentials'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCredentialDialog(false);
                  setCurrentPassword('');
                  setNewUsername('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}