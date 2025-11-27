import { projectId, publicAnonKey } from './supabase/info';
import { supabase } from './supabase';

// v2.0 - checkStatus method added
const API_URL = `https://${projectId}.supabase.co/functions/v1/server`;

interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  [key: string]: any;
}

class ApiClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  setAccessToken(token: string | null) {
    this.accessToken = token;
    if (token) {
      localStorage.setItem('staff_mgmt_access_token', token);
    } else {
      localStorage.removeItem('staff_mgmt_access_token');
    }
  }

  getAccessToken(): string | null {
    if (!this.accessToken) {
      this.accessToken = localStorage.getItem('staff_mgmt_access_token');
    }
    return this.accessToken;
  }

  setRefreshToken(token: string | null) {
    this.refreshToken = token;
    if (token) {
      localStorage.setItem('staff_mgmt_refresh_token', token);
    } else {
      localStorage.removeItem('staff_mgmt_refresh_token');
    }
  }

  getRefreshToken(): string | null {
    if (!this.refreshToken) {
      this.refreshToken = localStorage.getItem('staff_mgmt_refresh_token');
    }
    return this.refreshToken;
  }

  async refreshAccessToken(): Promise<boolean> {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        console.error('No refresh token available');
        return false;
      }

      console.log('Attempting to refresh access token...');
      const response = await fetch(`${API_URL}/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        console.error('Token refresh failed:', response.status);
        return false;
      }

      const data = await response.json();
      
      if (data.success && data.accessToken) {
        this.setAccessToken(data.accessToken);
        if (data.refreshToken) {
          this.setRefreshToken(data.refreshToken);
        }
        
        // Update stored user if provided
        if (data.user) {
          const storedUser = localStorage.getItem('staff_mgmt_current_user');
          if (storedUser) {
            const user = JSON.parse(storedUser);
            localStorage.setItem('staff_mgmt_current_user', JSON.stringify({
              ...user,
              ...data.user
            }));
          }
        }
        
        console.log('Access token refreshed successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<T> {
    const token = this.getAccessToken();
    const isUsingToken = token && token !== publicAnonKey;
    
    if (isUsingToken) {
      console.log(`API Request to ${endpoint} with auth token (${token?.substring(0, 20)}...)`);
    } else {
      console.log(`API Request to ${endpoint} with public key`);
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token || publicAnonKey}`,
      ...options.headers,
    };

    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        console.error(`API Error for ${endpoint}:`, response.status, error.error);
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      console.log(`API Success for ${endpoint}`);
      return response.json();
    } catch (error) {
      // Re-throw with more context for network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to server');
      }
      
      // Handle token expiration
      if (error instanceof Error && error.message.includes('HTTP 401')) {
        if (!isRetry) {
          console.log('Token expired, attempting to refresh...');
          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            console.log('Token refreshed, retrying request...');
            return this.request(endpoint, options, true);
          }
        }
      }
      
      throw error;
    }
  }

  // Auth
  async login(email: string, password: string) {
    const result = await this.request<{
      success: boolean;
      accessToken: string;
      refreshToken: string;
      user: any;
    }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (result.accessToken) {
      this.setAccessToken(result.accessToken);
    }
    
    if (result.refreshToken) {
      this.setRefreshToken(result.refreshToken);
    }
    
    // CRITICAL: Set the Supabase client session with the new tokens
    // This ensures all Supabase queries use the correct authenticated user
    if (result.accessToken && result.refreshToken) {
      console.log('[login] Setting Supabase session for user:', result.user?.email);
      const { error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      
      if (error) {
        console.error('[login] Failed to set Supabase session:', error);
      } else {
        console.log('[login] Supabase session set successfully');
      }
    }
    
    return result;
  }

  async signup(email: string, password: string, name: string, role = 'staff') {
    return this.request('/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, role }),
    });
  }

  async migrateAdmin() {
    return this.request<{ success: boolean; message: string; credentials?: any }>('/migrate-admin', {
      method: 'POST',
    });
  }

  async forceReinit() {
    return this.request<{ success: boolean; message: string; credentials?: any }>('/force-reinit', {
      method: 'POST',
    });
  }

  async setupPassword(email: string, tempPassword: string, newPassword: string) {
    const result = await this.request<{
      success: boolean;
      accessToken: string;
      refreshToken: string;
      user: any;
      message: string;
    }>('/staff/setup-password', {
      method: 'POST',
      body: JSON.stringify({ email, tempPassword, newPassword }),
    });
    
    if (result.accessToken) {
      this.setAccessToken(result.accessToken);
    }
    
    if (result.refreshToken) {
      this.setRefreshToken(result.refreshToken);
    }
    
    // CRITICAL: Set the Supabase client session with the new tokens
    // This ensures all Supabase queries use the correct authenticated user
    if (result.accessToken && result.refreshToken) {
      console.log('[setupPassword] Setting Supabase session for user:', result.user?.email);
      const { error } = await supabase.auth.setSession({
        access_token: result.accessToken,
        refresh_token: result.refreshToken,
      });
      
      if (error) {
        console.error('[setupPassword] Failed to set Supabase session:', error);
      } else {
        console.log('[setupPassword] Supabase session set successfully');
      }
    }
    
    return result;
  }

  logout() {
    this.setAccessToken(null);
    this.setRefreshToken(null);
  }

  // Events
  async getEvents() {
    return this.request<{ events: any[] }>('/events');
  }

  async createEvent(eventData: any) {
    return this.request<{ success: boolean; event: any }>('/events', {
      method: 'POST',
      body: JSON.stringify(eventData),
    });
  }

  async updateEvent(eventId: string, eventData: any) {
    return this.request<{ success: boolean; event: any }>(`/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(eventData),
    });
  }

  async cancelEvent(eventId: string) {
    return this.request<{ success: boolean; event: any }>(`/events/${eventId}/cancel`, {
      method: 'POST',
    });
  }

  async reinstateEvent(eventId: string) {
    return this.request<{ success: boolean; event: any }>(`/events/${eventId}/reinstate`, {
      method: 'POST',
    });
  }

  async deleteEvent(eventId: string) {
    return this.request<{ success: boolean }>(`/events/${eventId}`, {
      method: 'DELETE',
    });
  }

  async closeEvent(eventId: string, approvedStaffIds: string[]) {
    return this.request<{ success: boolean; event: any }>(`/events/close`, {
      method: 'POST',
      body: JSON.stringify({ eventId, approvedStaffIds }),
    });
  }

  // Staff
  async getStaff() {
    return this.request<{ staff: any[] }>('/staff');
  }

  async inviteStaff(email: string, name: string, phone: string) {
    // Get the app URL from the current location
    const appUrl = window.location.origin;
    
    return this.request<{ 
      success: boolean; 
      staff: any; 
      tempPassword: string; 
      emailSent: boolean;
      isTestingMode?: boolean;
      invitationLink?: string;
    }>(
      '/staff/invite',
      {
        method: 'POST',
        body: JSON.stringify({ email, name, phone, appUrl }),
      }
    );
  }

  async updateStaff(staffId: string, name: string, email: string, phone: string, level: string, telegramUsername: string) {
    return this.request<{ success: boolean; staff: any }>(
      `/staff/${staffId}`,
      {
        method: 'PUT',
        body: JSON.stringify({ name, email, phone, level, telegramUsername }),
      }
    );
  }

  async updateStaffStatus(staffId: string, status: 'active' | 'inactive') {
    return this.request<{ success: boolean; staff: any }>(
      `/staff/${staffId}/status`,
      {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }
    );
  }

  async sendPasswordReset(staffId: string) {
    return this.request<{ 
      success: boolean; 
      message: string; 
      emailSent: boolean;
      isTestingMode?: boolean;
      tempPassword?: string;
    }>(
      '/staff/password-reset',
      {
        method: 'POST',
        body: JSON.stringify({ staffId }),
      }
    );
  }

  async forgotPassword(email: string) {
    return this.request<{ 
      success: boolean; 
      message: string; 
      emailSent: boolean;
      isTestingMode?: boolean;
      tempPassword?: string;
    }>(
      '/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      }
    );
  }

  async sendTelegramTest(staffId: string) {
    return this.request<{ 
      success: boolean; 
      message: string;
    }>(
      '/telegram/test',
      {
        method: 'POST',
        body: JSON.stringify({ staffId }),
      }
    );
  }

  async deleteStaff(staffId: string) {
    return this.request<{ success: boolean; message: string }>(
      `/staff/${staffId}`,
      {
        method: 'DELETE',
      }
    );
  }

  // Points
  async adjustPoints(staffId: string, points: number, reason: string) {
    return this.request<{
      success: boolean;
      staff: any;
      adjustment: any;
      leveledUp: boolean;
    }>('/points/adjust', {
      method: 'POST',
      body: JSON.stringify({ staffId, points, reason }),
    });
  }

  async getAdjustments() {
    // Query Supabase directly to bypass edge function deployment issues
    // Staff users will only see their own adjustments due to RLS policies
    try {
      console.log('[getAdjustments] Starting query');
      
      // Ensure we have a valid session in Supabase client
      const token = this.getAccessToken();
      console.log('[getAdjustments] Token available:', !!token, 'Is public key:', token === publicAnonKey);
      
      if (!token || token === publicAnonKey) {
        console.error('[getAdjustments] No authenticated user - no valid token');
        return { adjustments: [] };
      }
      
      // Set the session in Supabase client if we have a token
      // This ensures supabase.auth.getUser() will work
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('[getAdjustments] Current session exists:', !!session, 'Error:', sessionError);
      
      if (!session && token !== publicAnonKey) {
        // Try to set the session using the stored tokens
        const refreshToken = this.getRefreshToken();
        console.log('[getAdjustments] Refresh token available:', !!refreshToken);
        
        if (refreshToken) {
          console.log('[getAdjustments] Restoring Supabase session from stored tokens');
          const { data, error } = await supabase.auth.setSession({
            access_token: token,
            refresh_token: refreshToken,
          });
          
          if (error) {
            console.error('[getAdjustments] Failed to restore session:', error);
            return { adjustments: [] };
          }
          console.log('[getAdjustments] Session restored successfully');
        } else {
          console.error('[getAdjustments] No refresh token available to restore session');
          return { adjustments: [] };
        }
      }
      
      // Get current user to filter data
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('[getAdjustments] User fetched:', !!user, 'Error:', userError);
      
      if (!user) {
        console.error('[getAdjustments] No authenticated user');
        return { adjustments: [] };
      }
      
      const isAdmin = user.user_metadata?.role === 'admin';
      console.log('[getAdjustments] User:', user.id, 'Role:', user.user_metadata?.role, 'isAdmin:', isAdmin);
      
      // Fetch point adjustments
      let adjustmentsQuery = supabase
        .from('point_adjustments')
        .select('*');
      
      // If staff user, filter to only their adjustments
      if (!isAdmin) {
        console.log('[getAdjustments] Staff user - filtering by staff_id:', user.id);
        adjustmentsQuery = adjustmentsQuery.eq('staff_id', user.id);
      } else {
        console.log('[getAdjustments] Admin user - fetching all adjustments');
      }
      
      const { data: adjustments, error: adjustmentsError } = await adjustmentsQuery
        .order('created_at', { ascending: false });
      
      console.log('[getAdjustments] Adjustments query result:', adjustments?.length || 0, 'records', 'Error:', adjustmentsError);
      
      if (adjustmentsError) {
        console.error('[getAdjustments] Error fetching adjustments:', adjustmentsError);
        throw new Error(adjustmentsError.message);
      }
      
      console.log('[getAdjustments] Success:', adjustments?.length || 0, 'adjustments');
      
      // Map database fields to match frontend interfaces
      const mappedAdjustments = (adjustments || []).map(adj => ({
        id: adj.id,
        staffId: adj.staff_id,
        points: adj.points,
        reason: adj.reason,
        timestamp: adj.created_at, // Map created_at to timestamp
        adminId: adj.admin_id,
      }));
      
      return { adjustments: mappedAdjustments };
    } catch (error) {
      console.error('[getAdjustments] Unexpected error:', error);
      throw error;
    }
  }

  // Signups
  async signUpForEvent(eventId: string) {
    return this.request<{ success: boolean; event: any }>('/signups', {
      method: 'POST',
      body: JSON.stringify({ eventId }),
    });
  }

  async cancelSignUp(eventId: string) {
    return this.request<{ success: boolean; event: any }>(`/signups/${eventId}`, {
      method: 'DELETE',
    });
  }

  async adminSignUpStaff(eventId: string, staffIds: string[]) {
    return this.request<{ success: boolean; event: any; addedCount: number }>('/signups/admin', {
      method: 'POST',
      body: JSON.stringify({ eventId, staffIds }),
    });
  }

  async confirmParticipation(eventId: string, staffId: string) {
    return this.request<{ success: boolean; event: any }>('/participation/confirm', {
      method: 'POST',
      body: JSON.stringify({ eventId, staffId }),
    });
  }

  async changeAdminCredentials(currentPassword: string, newUsername?: string, newPassword?: string) {
    return this.request<{ success: boolean; message: string; accessToken: string; user: any }>('/admin/change-credentials', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newUsername, newPassword }),
    });
  }

  // Initialization
  async initialize() {
    return this.request<{ success: boolean; message: string; credentials?: any }>(
      '/init',
      {
        method: 'POST',
      }
    );
  }

  async deduplicateStaff() {
    return this.request<{ success: boolean; message: string; duplicatesRemoved: number; orphansRemoved: number }>(
      '/deduplicate-staff',
      {
        method: 'POST',
      }
    );
  }

  async diagnoseStaff() {
    return this.request<{
      summary: {
        totalAuthUsers: number;
        totalKVUsers: number;
        authDuplicates: number;
        kvDuplicates: number;
        orphanedKVRecords: number;
        missingKVRecords: number;
      };
      details: any;
    }>('/diagnose-staff');
  }

  async repairStaffNames() {
    return this.request<{ 
      success: boolean; 
      message: string; 
      repaired: number; 
      skipped: number;
      errors: string[];
    }>('/repair-staff-names', {
      method: 'POST',
    });
  }

  async verifyStaffNames() {
    return this.request<{
      success: boolean;
      message: string;
      staffWithNames: number;
      staffWithoutNames: number;
      details: Array<{
        email: string;
        name: string | null;
        hasName: boolean;
      }>;
    }>('/verify-staff-names');
  }

  async diagnoseEvents() {
    return this.request<{
      success: boolean;
      totalEvents: number;
      events: Array<{
        id: string;
        name: string;
        date: string;
        status: string;
        createdAt: string;
        signedUpCount: number;
        confirmedCount: number;
      }>;
      fullEvents: any[];
    }>('/diagnose-events');
  }

  async diagnoseUserMetadata() {
    return this.request<{
      success: boolean;
      totalStaff: number;
      staffWithNames: number;
      staffWithoutNames: number;
      staffUsers: any[];
    }>('/diagnose-user-metadata');
  }

  async checkStatus() {
    try {
      // Use public anon key for status check - it's needed before login
      const response = await fetch(`${API_URL}/status`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });
      
      if (!response.ok) {
        console.error('Status check failed with status:', response.status);
        // Try to get error details
        const text = await response.text().catch(() => 'Network connection lost.');
        console.error('Error response:', text);
        throw new Error(`Server error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error: any) {
      console.error('Status check error:', error);
      // Return a safe default to prevent app from breaking
      return { 
        initialized: true, // Assume initialized to allow login attempts
        usersCount: 0,
        eventsCount: 0,
        levelsCount: 0,
        error: error.message 
      };
    }
  }

  // Admin Settings
  async getAdminSettings() {
    return this.request<{ email: string; phone: string }>('/admin/settings');
  }

  async saveAdminSettings(email: string, phone: string) {
    return this.request<{ success: boolean }>('/admin/settings', {
      method: 'POST',
      body: JSON.stringify({ email, phone }),
    });
  }

  // Levels
  async getLevels() {
    try {
      // Use public anon key for levels - they're needed during login
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      };

      console.log('Fetching levels from:', `${API_URL}/levels`);
      const response = await fetch(`${API_URL}/levels`, {
        headers,
        mode: 'cors',
      });
      
      console.log('Levels response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('Levels fetch failed with status:', response.status, errorText);
        return { levels: [] };
      }
      
      const data = await response.json();
      console.log('Levels fetched successfully:', data?.levels?.length || 0, 'levels');
      return data;
    } catch (error) {
      console.error('Levels fetch error:', error);
      // Log more details about the error
      if (error instanceof TypeError) {
        console.error('This is likely a network or CORS error.');
        console.error('URL being fetched:', `${API_URL}/levels`);
        console.error('Full error:', error.message);
      }
      return { levels: [] };
    }
  }

  async addLevel(name: string, minPoints: number) {
    return this.request<{ success: boolean; level: any }>('/levels', {
      method: 'POST',
      body: JSON.stringify({ name, minPoints }),
    });
  }

  async updateLevel(levelId: string, name: string, minPoints: number) {
    return this.request<{ success: boolean; level: any }>(`/levels/${levelId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, minPoints }),
    });
  }

  async deleteLevel(levelId: string) {
    return this.request<{ success: boolean }>(`/levels/${levelId}`, {
      method: 'DELETE',
    });
  }

  async reorderLevel(levelId: string, direction: 'up' | 'down') {
    return this.request<{ success: boolean; levels: any[] }>('/levels/reorder', {
      method: 'POST',
      body: JSON.stringify({ levelId, direction }),
    });
  }

  // WhatsApp Integration
  async connectWhatsApp(phoneNumberId: string, accessToken: string) {
    return this.request<{ success: boolean; phoneNumber?: string }>('/whatsapp/connect', {
      method: 'POST',
      body: JSON.stringify({ phoneNumberId, accessToken }),
    });
  }

  async getWhatsAppStatus() {
    return this.request<{ connected: boolean; phoneNumber?: string }>('/whatsapp/status');
  }

  // Telegram Integration
  async connectTelegram(botToken: string) {
    return this.request<{ success: boolean; botName?: string }>('/telegram/connect', {
      method: 'POST',
      body: JSON.stringify({ botToken }),
    });
  }

  async getTelegramStatus() {
    return this.request<{ connected: boolean; botName?: string }>('/telegram/status');
  }

  async getTelegramRecentChats() {
    return this.request<{ 
      success: boolean; 
      chats: Array<{
        chatId: string;
        firstName: string;
        lastName: string;
        username: string;
        lastMessage: string;
        timestamp: number;
      }>;
      count: number;
    }>('/telegram/get-recent-chats', {
      method: 'POST',
    });
  }

  async clearTelegramUpdates() {
    return this.request<{ success: boolean; message: string }>('/telegram/clear-updates', {
      method: 'POST',
    });
  }

  async getNotificationDebug() {
    return this.request<any>('/debug/notifications');
  }

  // Email Configuration
  async getEmailConfig() {
    return this.request<{ fromEmail: string; isTestMode: boolean }>('/email-config');
  }
}

export const api = new ApiClient();