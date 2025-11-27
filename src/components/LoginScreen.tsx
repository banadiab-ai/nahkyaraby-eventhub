import { useState, useEffect } from 'react';
import { Mail, Lock, Briefcase, Info } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { PasswordSetup } from './PasswordSetup';
import { ForgotPassword } from './ForgotPassword';
import { api } from '../utils/api';
import { toast } from 'sonner@2.0.3';
import logoImage from 'figma:asset/a18c9f29652fad36842de1eae7c0067139d8f193.png';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => boolean | Promise<any>;
  onPasswordSetup?: (email: string, tempPassword: string, newPassword: string) => Promise<boolean>;
}

export function LoginScreen({ onLogin, onPasswordSetup }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);
  const [confirmationData, setConfirmationData] = useState<{ email: string; tempPassword: string } | null>(null);
  const [showManualLogin, setShowManualLogin] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate authentication delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const result = await onLogin(email, password);
    
    // Check if user needs to set up password
    if (result && typeof result === 'object' && result.needsPasswordSetup) {
      setConfirmationData({
        email: result.email,
        tempPassword: result.tempPassword
      });
      setShowPasswordSetup(true);
    }
    
    setIsLoading(false);
  };

  const handleDemoLogin = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    onLogin(demoEmail, demoPassword);
  };

  const handlePasswordSet = async (newPassword: string): Promise<boolean> => {
    if (!confirmationData || !onPasswordSetup) return false;
    
    const success = await onPasswordSetup(
      confirmationData.email,
      confirmationData.tempPassword,
      newPassword
    );
    
    if (success) {
      // Password setup successful - user is now logged in
      setShowPasswordSetup(false);
      setConfirmationData(null);
    }
    
    return success;
  };

  const handleCancelPasswordSetup = () => {
    setShowPasswordSetup(false);
    setConfirmationData(null);
    setEmail('');
    setPassword('');
  };

  if (showPasswordSetup && confirmationData) {
    return (
      <PasswordSetup
        email={confirmationData.email}
        tempPassword={confirmationData.tempPassword}
        onPasswordSet={handlePasswordSet}
        onCancel={handleCancelPasswordSetup}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#5D2972] to-[#00A5B5] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto mb-4">
            <img src={logoImage} alt="Nahky Araby Logo" className="w-48 h-auto mx-auto" />
          </div>
          <CardTitle>Nahky Araby Event Hub</CardTitle>
          <CardDescription>
            Sign in to manage events and track your progress
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Manual login form - displayed at the top */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-[#00A5B5] hover:text-[#008a97] underline"
                >
                  Forgot Password?
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-gray-500">
            New staff members receive login credentials via email
          </p>
        </CardContent>
      </Card>
      
      {/* Forgot Password Dialog */}
      <ForgotPassword 
        isOpen={showForgotPassword} 
        onClose={() => setShowForgotPassword(false)} 
      />
    </div>
  );
}