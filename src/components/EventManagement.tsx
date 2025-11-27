import { useState, useEffect } from 'react';
import { Plus, Calendar, MapPin, Clock, Award, Trash2, Search, Filter, Pencil, Users, XCircle, RotateCcw } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { Event, StaffMember } from '../App';
import { Level } from './AdminSettings';
import { DateInput } from './DateInput';
import { formatDateWithDay, formatDate } from '../utils/dateUtils';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Checkbox } from './ui/checkbox';
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

interface EventManagementProps {
  events: Event[];
  levels: Level[];
  staffMembers: StaffMember[];
  onAddEvent: (event: Omit<Event, 'id' | 'signedUpStaff' | 'createdAt'>) => void;
  onUpdateEvent: (eventId: string, event: Omit<Event, 'id' | 'signedUpStaff' | 'createdAt'>) => void;
  onCancelEvent: (eventId: string) => void;
  onReinstateEvent: (eventId: string) => void;
  onDeleteEvent: (eventId: string) => void;
  onCloseEvent: (eventId: string, approvedStaffIds: string[]) => void;
  onAdminSignUpStaff: (eventId: string, staffIds: string[]) => void;
}

export function EventManagement({ events, levels, staffMembers, onAddEvent, onUpdateEvent, onCancelEvent, onReinstateEvent, onDeleteEvent, onCloseEvent, onAdminSignUpStaff }: EventManagementProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [eventToDelete, setEventToDelete] = useState<Event | null>(null);
  const [eventToCancel, setEventToCancel] = useState<Event | null>(null);
  const [eventToReinstate, setEventToReinstate] = useState<Event | null>(null);
  const [eventToEdit, setEventToEdit] = useState<Event | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [approvedStaffIds, setApprovedStaffIds] = useState<string[]>([]);
  // Store approved staff per event to persist selections across dialog open/close
  const [approvedStaffByEvent, setApprovedStaffByEvent] = useState<Record<string, string[]>>({});
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showManualSignUpDialog, setShowManualSignUpDialog] = useState(false);
  const [selectedStaffForSignUp, setSelectedStaffForSignUp] = useState<string[]>([]);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  
  // Initialize approved staff IDs when selectedEvent changes
  useEffect(() => {
    if (selectedEvent) {
      console.log('🎯 selectedEvent changed:', {
        eventId: selectedEvent.id,
        eventName: selectedEvent.name,
        status: selectedEvent.status,
        confirmedStaff: selectedEvent.confirmedStaff,
        hasApprovedStaffByEvent: !!approvedStaffByEvent[selectedEvent.id],
        approvedStaffByEventValue: approvedStaffByEvent[selectedEvent.id]
      });
      
      // For closed/cancelled events, ALWAYS use backend's confirmedStaff (ignore local cache)
      // For open events, use local cache if available, otherwise use backend data
      if (selectedEvent.status === 'closed' || selectedEvent.status === 'cancelled') {
        console.log('📋 Event is closed/cancelled - loading from backend confirmedStaff:', selectedEvent.confirmedStaff);
        setApprovedStaffIds(selectedEvent.confirmedStaff || []);
      } else if (approvedStaffByEvent[selectedEvent.id]) {
        console.log('📋 Loading from approvedStaffByEvent:', approvedStaffByEvent[selectedEvent.id]);
        setApprovedStaffIds(approvedStaffByEvent[selectedEvent.id]);
      } else if (selectedEvent.confirmedStaff) {
        // Otherwise use confirmedStaff from the event
        console.log('📋 Loading from selectedEvent.confirmedStaff:', selectedEvent.confirmedStaff);
        setApprovedStaffIds(selectedEvent.confirmedStaff);
      } else {
        console.log('📋 No saved selections or confirmedStaff, using empty array');
        setApprovedStaffIds([]);
      }
    } else {
      setApprovedStaffIds([]);
    }
  }, [selectedEvent]); // Only run when selectedEvent changes, not approvedStaffByEvent
  
  // Keep selectedEvent in sync with events array (handles real-time updates)
  useEffect(() => {
    if (selectedEvent) {
      const updatedEvent = events.find(e => e.id === selectedEvent.id);
      if (updatedEvent) {
        // Check if the event data has changed (compare key fields)
        const hasChanged = 
          updatedEvent.status !== selectedEvent.status ||
          JSON.stringify(updatedEvent.signedUpStaff) !== JSON.stringify(selectedEvent.signedUpStaff) ||
          JSON.stringify(updatedEvent.confirmedStaff) !== JSON.stringify(selectedEvent.confirmedStaff);
        
        if (hasChanged) {
          console.log('🔄 Syncing selectedEvent with updated events array', {
            status: `${selectedEvent.status} → ${updatedEvent.status}`,
            signedUpStaff: `${selectedEvent.signedUpStaff.length} → ${updatedEvent.signedUpStaff.length}`,
            confirmedStaff: `${selectedEvent.confirmedStaff?.length || 0} → ${updatedEvent.confirmedStaff?.length || 0}`
          });
          setSelectedEvent(updatedEvent);
        }
      }
    }
  }, [events, selectedEvent]);
  
  // Save approved staff IDs to persistent storage whenever they change
  // BUT only for open events (not closed/cancelled, as those should use backend data)
  useEffect(() => {
    if (selectedEvent && selectedEvent.status === 'open') {
      setApprovedStaffByEvent(prev => ({
        ...prev,
        [selectedEvent.id]: approvedStaffIds
      }));
    }
  }, [approvedStaffIds, selectedEvent]);
  
  // Update selectedEvent when the events prop changes (e.g., after admin signup)
  useEffect(() => {
    if (selectedEvent) {
      const updatedEvent = events.find(e => e.id === selectedEvent.id);
      if (updatedEvent) {
        console.log('🔄 Updating selectedEvent from events array:', {
          eventName: updatedEvent.name,
          confirmedStaff: updatedEvent.confirmedStaff,
          signedUpStaff: updatedEvent.signedUpStaff,
          status: updatedEvent.status
        });
        setSelectedEvent(updatedEvent);
      }
    }
  }, [events, selectedEvent?.id]); // Only depend on events and selected event ID
  
  // Sort levels by order (top is lowest, bottom is highest) and ensure uniqueness
  const sortedLevels = levels 
    ? Array.from(new Map(levels.map(level => [level.id, level])).values()).sort((a, b) => a.order - b.order)
    : [];
  const defaultLevel = sortedLevels.length > 0 ? sortedLevels[0].name : '';
  
  // Get today's date for event categorization
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const [formData, setFormData] = useState({
    name: '',
    date: '',
    endDate: '',
    time: '',
    duration: '', // Add duration field
    location: '',
    description: '',
    notes: '',
    points: '',
    requiredLevel: defaultLevel,
    status: 'draft' as 'draft' | 'open' | 'closed'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const eventData = {
      name: formData.name,
      date: formData.date,
      endDate: formData.endDate || formData.date, // If end date is empty, use start date
      time: formData.time,
      duration: formData.duration, // Add duration to event data
      location: formData.location,
      description: formData.description,
      notes: formData.notes,
      points: parseInt(formData.points),
      requiredLevel: formData.requiredLevel,
      status: formData.status
    };

    if (eventToEdit) {
      onUpdateEvent(eventToEdit.id, eventData);
    } else {
      onAddEvent(eventData);
    }
    
    setFormData({
      name: '',
      date: '',
      endDate: '',
      time: '',
      duration: '', // Reset duration
      location: '',
      description: '',
      notes: '',
      points: '',
      requiredLevel: defaultLevel,
      status: 'draft'
    });
    setIsDialogOpen(false);
    setEventToEdit(null);
  };

  const handleEditEvent = (event: Event) => {
    setEventToEdit(event);
    setFormData({
      name: event.name,
      date: event.date,
      endDate: event.endDate || event.date, // If end date is empty, use start date
      time: event.time,
      duration: event.duration, // Add duration to form data
      location: event.location,
      description: event.description,
      notes: event.notes,
      points: event.points.toString(),
      requiredLevel: event.requiredLevel,
      status: (event.status === 'cancelled' || !event.status || event.status === 'draft' || event.status === 'open' || event.status === 'closed') 
        ? (event.status === 'cancelled' ? 'draft' : (event.status || 'draft')) as 'draft' | 'open' | 'closed'
        : 'draft'
    });
    setIsDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEventToEdit(null);
      setFormData({
        name: '',
        date: '',
        endDate: '',
        time: '',
        duration: '', // Reset duration
        location: '',
        description: '',
        notes: '',
        points: '',
        requiredLevel: defaultLevel,
        status: 'draft'
      });
    }
  };

  const sortedEvents = [...events].sort((a, b) => 
    new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Filter events based on search and level filter
  const filteredEvents = sortedEvents.filter(event => {
    const matchesSearch = event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = filterLevel === 'all' || event.requiredLevel === filterLevel;
    return matchesSearch && matchesLevel;
  });

  // Categorize events based on Start Date and End Date
  const currentEvents = filteredEvents.filter(e => {
    // Skip events without dates
    if (!e.date) {
      console.log('⚠️ Event has no date:', e.name);
      return false;
    }
    
    try {
      // Parse start date as local to avoid timezone issues
      const [startYear, startMonth, startDay] = e.date.split('-').map(Number);
      if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay)) {
        console.error('❌ Invalid date format for event:', e.name, 'date:', e.date);
        return false;
      }
      
      const startDate = new Date(startYear, startMonth - 1, startDay);
      startDate.setHours(0, 0, 0, 0);
      
      // Parse end date (or use start date if not provided)
      const endDateStr = e.endDate || e.date;
      const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
      if (isNaN(endYear) || isNaN(endMonth) || isNaN(endDay)) {
        console.error('❌ Invalid end date format for event:', e.name, 'endDate:', endDateStr);
        return false;
      }
      
      const endDate = new Date(endYear, endMonth - 1, endDay);
      endDate.setHours(0, 0, 0, 0);
      
      // Debug logging for "Testing new event1"
      if (e.name.includes('Testing')) {
        console.log('🔍 Event Debug:', {
          name: e.name,
          startDateRaw: e.date,
          endDateRaw: e.endDate,
          endDateStr,
          today: today.toISOString().split('T')[0],
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          todayVsStart: `today (${today.toISOString().split('T')[0]}) >= startDate (${startDate.toISOString().split('T')[0]}) = ${today >= startDate}`,
          todayVsEnd: `today (${today.toISOString().split('T')[0]}) <= endDate (${endDate.toISOString().split('T')[0]}) = ${today <= endDate}`,
          result: today >= startDate && today <= endDate && e.status !== 'cancelled'
        });
      }
      
      // Current: Today is equal or between Start Date and End Date
      return today >= startDate && today <= endDate && e.status !== 'cancelled';
    } catch (error) {
      console.error('❌ Error parsing dates for event:', e.name, error);
      return false;
    }
  });

  const upcomingEvents = filteredEvents.filter(e => {
    // Skip events without dates
    if (!e.date) return false;
    
    try {
      // Parse start date as local to avoid timezone issues
      const [startYear, startMonth, startDay] = e.date.split('-').map(Number);
      if (isNaN(startYear) || isNaN(startMonth) || isNaN(startDay)) {
        return false;
      }
      
      const startDate = new Date(startYear, startMonth - 1, startDay);
      startDate.setHours(0, 0, 0, 0);
      
      // Upcoming: Today is before the Start Date
      return today < startDate && e.status !== 'cancelled';
    } catch (error) {
      console.error('❌ Error parsing date for upcoming event:', e.name, error);
      return false;
    }
  });

  const pastEvents = filteredEvents.filter(e => {
    // Skip events without dates
    if (!e.date) return false;
    
    try {
      // Parse end date (or use start date if not provided)
      const endDateStr = e.endDate || e.date;
      const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
      if (isNaN(endYear) || isNaN(endMonth) || isNaN(endDay)) {
        return false;
      }
      
      const endDate = new Date(endYear, endMonth - 1, endDay);
      endDate.setHours(0, 0, 0, 0);
      
      // Past: Today is after the End Date
      return (today > endDate && e.status !== 'cancelled') || e.status === 'cancelled';
    } catch (error) {
      console.error('❌ Error parsing date for past event:', e.name, error);
      return false;
    }
  });

  const EventCard = ({ event, isPast = false }: { event: Event; isPast?: boolean }) => {
    const isCancelled = event.status === 'cancelled';
    const isDraft = event.status === 'draft';
    const isClosed = event.status === 'closed';
    
    // Check if event date has passed (for open events in current events section)
    const endDateStr = event.endDate || event.date;
    const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
    const eventEndDate = new Date(endYear, endMonth - 1, endDay);
    eventEndDate.setHours(23, 59, 59, 999); // End of day
    const hasDatePassed = new Date() > eventEndDate;
    const isOverdue = !isCancelled && !isPast && event.status === 'open' && hasDatePassed;
    
    return (
      <Card 
        key={event.id}
        className={`cursor-pointer hover:shadow-lg transition-shadow ${isPast || isCancelled ? 'opacity-60' : ''} ${isCancelled ? 'border-red-200 bg-red-50/30' : ''} ${isDraft ? 'border-gray-300 bg-gray-50/30' : ''} ${isOverdue ? 'border-amber-200 bg-amber-50/30' : ''}`}
        onClick={() => {
          console.log('🔍 Event clicked:', event.name, 'confirmedStaff:', event.confirmedStaff, 'status:', event.status);
          // Clear local cache for closed/cancelled events to force loading from backend
          if (event.status === 'closed' || event.status === 'cancelled') {
            setApprovedStaffByEvent(prev => {
              const updated = { ...prev };
              delete updated[event.id];
              return updated;
            });
          }
          setSelectedEvent(event);
        }}
      >
        <CardHeader>
          <CardTitle className="flex items-start justify-between">
            <span className={isCancelled ? 'line-through text-gray-500' : ''}>{event.name}</span>
            <div className="flex flex-col gap-1 ml-2">
              {isCancelled ? (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <XCircle className="h-3 w-3" />
                  Cancelled
                </Badge>
              ) : isPast ? (
                <Badge variant="outline">Completed</Badge>
              ) : (
                <Badge variant="secondary">
                  <Award className="h-3 w-3 mr-1" />
                  {event.points} pts
                </Badge>
              )}
              {!isCancelled && !isPast && (
                <>
                  <Badge 
                    variant={isDraft ? 'outline' : isClosed ? 'secondary' : 'default'}
                    className={isDraft ? 'border-gray-400 text-gray-600' : isClosed ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}
                  >
                    {isDraft ? 'Draft' : isClosed ? 'Closed' : 'Open'}
                  </Badge>
                  {isOverdue && (
                    <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50">
                      ⚠️ Date Passed
                    </Badge>
                  )}
                </>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center text-gray-600">
            <Calendar className="h-4 w-4 mr-2" />
            {formatDateWithDay(event.date)}
            {event.endDate && event.endDate !== event.date && (
              <span className="ml-1">→ {formatDateWithDay(event.endDate)}</span>
            )}
          </div>
          
          {!isPast && (
            <>
              <div className="flex items-center text-gray-600">
                <Clock className="h-4 w-4 mr-2" />
                {event.time}
              </div>
              
              <div className="flex items-center text-gray-600">
                <MapPin className="h-4 w-4 mr-2" />
                {event.location}
              </div>
            </>
          )}
          
          <div className="pt-2 border-t">
            <div>
              {!isPast && <p className="text-gray-500">Level: {event.requiredLevel || 'All Staff'}</p>}
              <p className="text-gray-500">{isPast ? 'Participants' : 'Sign-ups'}: {event.signedUpStaff.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-gray-900">Event Management</h2>
          <p className="text-gray-500">Create and manage events for staff members</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{eventToEdit ? 'Edit Event' : 'Create New Event'}</DialogTitle>
              <DialogDescription>
                {eventToEdit ? 'Update event details' : 'Add a new event for staff members to sign up'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Event Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Summer Workshop Series"
                  required
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Start Date</Label>
                  <DateInput
                    id="date"
                    value={formData.date}
                    onChange={(value) => {
                      // If start date changes and is after end date, clear end date
                      const newFormData = { ...formData, date: value };
                      if (formData.endDate && value > formData.endDate) {
                        newFormData.endDate = '';
                      }
                      setFormData(newFormData);
                    }}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="time">Time</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date (Optional)</Label>
                <DateInput
                  id="endDate"
                  value={formData.endDate}
                  onChange={(value) => setFormData({ ...formData, endDate: value })}
                  required={false}
                  minDate={formData.date}
                />
                <p className="text-xs text-gray-500">If left empty, will default to Start Date</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (Optional)</Label>
                <Input
                  id="duration"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  placeholder="e.g., 2 hours"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Main Campus - Room 101"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., A comprehensive workshop series on summer programming"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g., Bring your own laptop"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="points">Points Value</Label>
                <Input
                  id="points"
                  type="number"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: e.target.value })}
                  placeholder="e.g., 150"
                  required
                  min="0"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="level">Required Level</Label>
                <Select
                  value={formData.requiredLevel}
                  onValueChange={(value) => setFormData({ ...formData, requiredLevel: value })}
                >
                  <SelectTrigger id="level">
                    <SelectValue placeholder="Select a level" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedLevels.length === 0 ? (
                      <SelectItem value="no-levels" disabled>No levels configured</SelectItem>
                    ) : (
                      sortedLevels.map((level) => (
                        <SelectItem key={level.id} value={level.name}>
                          {level.name} ({level.minPoints}+ pts)
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Event Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: 'draft' | 'open' | 'closed') => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft (Admin only)</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full">
                {eventToEdit ? 'Update Event' : 'Create Event'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search events by name or location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {sortedLevels.map((level) => (
              <SelectItem key={level.id} value={level.name}>
                {level.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Current Events (Today) */}
      {currentEvents.length > 0 && (
        <div>
          <h3 className="text-gray-900 mb-4">Current Events - Today ({currentEvents.length})</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {currentEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Events */}
      <div>
        <h3 className="text-gray-900 mb-4">Upcoming Events ({upcomingEvents.length})</h3>
        {upcomingEvents.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              {currentEvents.length > 0 ? 'No future events scheduled.' : 'No upcoming events. Create one to get started!'}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcomingEvents.map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* Past Events */}
      {pastEvents.length > 0 && (
        <div>
          <h3 className="text-gray-900 mb-4">Past Events ({pastEvents.length})</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastEvents.map(event => (
              <EventCard key={event.id} event={event} isPast={true} />
            ))}
          </div>
        </div>
      )}

      {/* Reinstate Event Confirmation Dialog */}
      <AlertDialog open={!!eventToReinstate} onOpenChange={() => setEventToReinstate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reinstate Event?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reinstate "{eventToReinstate?.name}"? 
              The event will become active again and visible to staff members for sign-ups.
              All previously signed-up staff ({(eventToReinstate?.status === 'closed' ? (eventToReinstate?.confirmedStaff?.length || 0) : (eventToReinstate?.signedUpStaff.length || 0))}) will remain registered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (eventToReinstate) {
                  onReinstateEvent(eventToReinstate.id);
                  setEventToReinstate(null);
                }
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Yes, Reinstate Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Event Confirmation Dialog */}
      <AlertDialog open={!!eventToCancel} onOpenChange={() => setEventToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Event?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel "{eventToCancel?.name}"? 
              All {((eventToCancel?.status === 'closed' || eventToCancel?.status === 'cancelled') ? (eventToCancel?.confirmedStaff?.length || 0) : (eventToCancel?.signedUpStaff.length || 0))} participating staff members will be notified via email and Telegram.
              The event will remain visible but marked as cancelled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, Keep Event</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (eventToCancel) {
                  onCancelEvent(eventToCancel.id);
                  setEventToCancel(null);
                }
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Yes, Cancel Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Event Confirmation Dialog */}
      <AlertDialog open={!!eventToDelete} onOpenChange={() => setEventToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{eventToDelete?.name}"? 
              This will permanently remove the event and all associated sign-ups. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (eventToDelete) {
                  onDeleteEvent(eventToDelete.id);
                  setEventToDelete(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Event Details Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => {
        if (!open && selectedEvent) {
          // Save approved staff before closing the dialog
          setApprovedStaffByEvent(prev => ({
            ...prev,
            [selectedEvent.id]: approvedStaffIds
          }));
          setSelectedEvent(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedEvent && (() => {
            // Always show ALL signed-up staff, regardless of event status
            // Admin needs to see who signed up AND who was selected/rejected
            const signedUpStaffDetails = selectedEvent.signedUpStaff
              .map(staffId => staffMembers.find(s => s.id === staffId))
              .filter(Boolean) as StaffMember[];
            
            // Sort by sign-up time (first come first served)
            signedUpStaffDetails.sort((a, b) => {
              const timestampA = selectedEvent.signUpTimestamps?.[a.id] || '';
              const timestampB = selectedEvent.signUpTimestamps?.[b.id] || '';
              return timestampA.localeCompare(timestampB);
            });

            const isCancelled = selectedEvent.status === 'cancelled';
            // Check if event is past based on end date (or start date if no end date)
            const endDateStr = selectedEvent.endDate || selectedEvent.date;
            const [endYear, endMonth, endDay] = endDateStr.split('-').map(Number);
            const endDate = new Date(endYear, endMonth - 1, endDay);
            endDate.setHours(0, 0, 0, 0);
            const isPast = today > endDate;
            const isClosed = selectedEvent.status === 'closed';

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-2xl flex items-center gap-2">
                    <span className={isCancelled ? 'line-through text-gray-500' : ''}>{selectedEvent.name}</span>
                    {isCancelled && (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <XCircle className="h-3 w-3" />
                        Cancelled
                      </Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription>Event details and participants</DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6">
                  {/* Event Details */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-base py-1 px-3">
                        <Award className="h-4 w-4 mr-2" />
                        {selectedEvent.points} Points
                      </Badge>
                      <Badge variant="outline">
                        Level: {selectedEvent.requiredLevel}
                      </Badge>
                    </div>

                    <div className="grid gap-3">
                      <div className="flex items-center text-gray-700">
                        <Calendar className="h-5 w-5 mr-3 text-gray-500" />
                        <div>
                          <p className="text-sm text-gray-500">Date</p>
                          <p>
                            {formatDateWithDay(selectedEvent.date)}
                            {selectedEvent.endDate && selectedEvent.endDate !== selectedEvent.date && (
                              <span> → {formatDateWithDay(selectedEvent.endDate)}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center text-gray-700">
                        <Clock className="h-5 w-5 mr-3 text-gray-500" />
                        <div>
                          <p className="text-sm text-gray-500">Time & Duration</p>
                          <p>{selectedEvent.time} ({selectedEvent.duration})</p>
                        </div>
                      </div>

                      <div className="flex items-center text-gray-700">
                        <MapPin className="h-5 w-5 mr-3 text-gray-500" />
                        <div>
                          <p className="text-sm text-gray-500">Location</p>
                          <p>{selectedEvent.location}</p>
                        </div>
                      </div>
                      
                      {selectedEvent.description && (
                        <div className="flex items-start text-gray-700">
                          <div className="mr-3 mt-1">
                            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-gray-500">Description</p>
                            <p>{selectedEvent.description}</p>
                          </div>
                        </div>
                      )}
                      
                      {selectedEvent.notes && (
                        <div className="flex items-start text-gray-700">
                          <div className="mr-3 mt-1">
                            <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <p className="text-sm text-gray-500">Notes</p>
                            <p>{selectedEvent.notes}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Signed Up Staff */}
                  <div className="border-t pt-4">
                    <div className="flex items-center mb-4">
                      <Users className="h-5 w-5 mr-2 text-gray-500" />
                      <h4 className="text-gray-900">
                        {isPast ? 'Participants' : 'Signed Up Staff'} ({signedUpStaffDetails.length})
                      </h4>
                    </div>
                    
                    {signedUpStaffDetails.length > 0 ? (
                      <div className="space-y-2">
                        {signedUpStaffDetails.map((staff) => {
                          const isConfirmed = selectedEvent.confirmedStaff?.includes(staff.id);
                          const isApproved = approvedStaffIds.includes(staff.id);
                          const signUpTimestamp = selectedEvent.signUpTimestamps?.[staff.id];
                          
                          // Format the sign-up timestamp
                          let signUpTimeDisplay = '';
                          if (signUpTimestamp) {
                            const signUpDate = new Date(signUpTimestamp);
                            signUpTimeDisplay = signUpDate.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                          }
                          
                          return (
                            <div
                              key={staff.id}
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                {!isCancelled && !isPast && !isClosed && (
                                  <Checkbox
                                    checked={isApproved}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setApprovedStaffIds(prev => [...prev, staff.id]);
                                      } else {
                                        setApprovedStaffIds(prev => prev.filter(id => id !== staff.id));
                                      }
                                    }}
                                  />
                                )}
                                <Avatar className="h-10 w-10">
                                  <AvatarFallback className="bg-blue-600 text-white">
                                    {staff.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <p className="font-medium">{staff.name}</p>
                                  <p className="text-sm text-gray-500">{staff.email}</p>
                                  {signUpTimeDisplay && (
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      Signed up: {signUpTimeDisplay}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-gray-500">Level</p>
                                <Badge variant="outline" className="text-xs">
                                  {staff.level || 'No Level'}
                                </Badge>
                                {(isClosed || isCancelled) && isConfirmed && (
                                  <Badge variant="default" className="bg-green-600 text-xs mt-1">
                                    Selected
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">
                        No staff members signed up yet
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  {isCancelled || isPast ? (
                    <div className="border-t pt-4 flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(null);
                          handleEditEvent(selectedEvent);
                        }}
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      {isCancelled && (
                        <Button
                          variant="outline"
                          className="flex-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(null);
                            setEventToReinstate(selectedEvent);
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reinstate
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEvent(null);
                          setEventToDelete(selectedEvent);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  ) : (
                    <div className="border-t pt-4 flex flex-col gap-2">
                      {/* Sign Up Staff and Edit buttons on same row */}
                      <div className="flex gap-2">
                        {selectedEvent.status !== 'closed' && selectedEvent.status !== 'cancelled' && (
                          <Button
                            variant="default"
                            className="flex-1 bg-blue-600 hover:bg-blue-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStaffForSignUp([]);
                              setShowManualSignUpDialog(true);
                            }}
                          >
                            <Users className="h-4 w-4 mr-2" />
                            Sign Up Staff
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(null);
                            handleEditEvent(selectedEvent);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        {selectedEvent.status !== 'closed' && signedUpStaffDetails.length > 0 && (
                          <Button
                            variant="default"
                            className="flex-1 bg-purple-600 hover:bg-purple-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCloseConfirm(true);
                            }}
                          >
                            Close Event
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(null);
                            setEventToCancel(selectedEvent);
                          }}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Cancel Event
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(null);
                            setEventToDelete(selectedEvent);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Close Event Confirmation Dialog */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Event?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {selectedEvent && (() => {
                const approvedCount = approvedStaffIds.length;
                const rejectedCount = selectedEvent.signedUpStaff.length - approvedCount;
                
                return (
                  <div className="space-y-2">
                    <p>
                      You are about to close "{selectedEvent.name}". This action will:
                    </p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Mark {approvedCount} selected staff member{approvedCount !== 1 ? 's' : ''} as selected</li>
                      {rejectedCount > 0 && (
                        <li>Mark {rejectedCount} unselected staff member{rejectedCount !== 1 ? 's' : ''} as not selected</li>
                      )}
                      <li>Mark the event as closed</li>
                    </ul>
                    <p className="text-sm text-gray-600 mt-2">
                      Note: Points must be awarded manually from the Staff tab.
                    </p>
                    {approvedCount === 0 && (
                      <p className="text-orange-600 font-medium mt-2">
                        ⚠️ No staff members selected.
                      </p>
                    )}
                  </div>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedEvent) {
                  onCloseEvent(selectedEvent.id, approvedStaffIds);
                  setShowCloseConfirm(false);
                  // Clean up the persistent storage for this event after closing
                  setApprovedStaffByEvent(prev => {
                    const updated = { ...prev };
                    delete updated[selectedEvent.id];
                    return updated;
                  });
                  setSelectedEvent(null);
                  setApprovedStaffIds([]);
                }
              }}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Yes, Close Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manual Staff Sign-Up Dialog */}
      <Dialog open={showManualSignUpDialog && !!selectedEvent} onOpenChange={(open) => {
        setShowManualSignUpDialog(open);
        if (!open) {
          setSelectedStaffForSignUp([]);
          setStaffSearchQuery('');
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedEvent && (() => {
            // Get all active staff members (Admin can override level requirements)
            const allActiveStaff = staffMembers.filter(staff => staff.status === 'active');
            
            // Filter by search query (name or level)
            const filteredStaff = allActiveStaff.filter(staff => {
              const matchesSearch = staff.name.toLowerCase().includes(staffSearchQuery.toLowerCase()) ||
                                    staff.level.toLowerCase().includes(staffSearchQuery.toLowerCase());
              return matchesSearch;
            });

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl">
                    Sign Up Staff for "{selectedEvent.name}"
                  </DialogTitle>
                  <DialogDescription>
                    Select staff members to manually sign up for this event. Admin can sign up any level (overrides event level requirement: {selectedEvent.requiredLevel}).
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  {/* Event Info */}
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">{formatDateWithDay(selectedEvent.date)} at {selectedEvent.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">{selectedEvent.points} Points - Level: {selectedEvent.requiredLevel}</span>
                    </div>
                  </div>

                  {/* Search Staff */}
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by staff name or level..."
                      value={staffSearchQuery}
                      onChange={(e) => setStaffSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  {/* Staff List */}
                  <div>
                    <h4 className="text-gray-900 mb-3">
                      Staff Members ({filteredStaff.length} total)
                    </h4>
                    
                    {filteredStaff.length > 0 ? (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {filteredStaff.map((staff) => {
                          const isAlreadySignedUp = selectedEvent.signedUpStaff.includes(staff.id);
                          const isSelected = selectedStaffForSignUp.includes(staff.id);
                          
                          return (
                            <div
                              key={staff.id}
                              className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                                isAlreadySignedUp
                                  ? 'border-green-300 bg-green-50 opacity-75'
                                  : isSelected 
                                    ? 'border-blue-500 bg-blue-50 cursor-pointer' 
                                    : 'border-gray-200 bg-white hover:border-gray-300 cursor-pointer'
                              }`}
                              onClick={() => {
                                if (!isAlreadySignedUp) {
                                  if (isSelected) {
                                    setSelectedStaffForSignUp(prev => prev.filter(id => id !== staff.id));
                                  } else {
                                    setSelectedStaffForSignUp(prev => [...prev, staff.id]);
                                  }
                                }
                              }}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <Checkbox
                                  checked={isAlreadySignedUp || isSelected}
                                  disabled={isAlreadySignedUp}
                                  onCheckedChange={(checked) => {
                                    if (!isAlreadySignedUp) {
                                      if (checked) {
                                        setSelectedStaffForSignUp(prev => [...prev, staff.id]);
                                      } else {
                                        setSelectedStaffForSignUp(prev => prev.filter(id => id !== staff.id));
                                      }
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <Avatar className="h-10 w-10">
                                  <AvatarFallback className="bg-blue-600 text-white">
                                    {staff.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <p className="font-medium">{staff.name}</p>
                                  <p className="text-sm text-gray-500">{staff.email}</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="outline" className="text-xs">
                                  {staff.level}
                                </Badge>
                                <p className="text-xs text-gray-500 mt-1">{staff.points} pts</p>
                                {isAlreadySignedUp && (
                                  <Badge variant="default" className="bg-green-600 text-xs mt-1">
                                    Signed Up
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-8">
                        {staffSearchQuery ? 'No staff found matching your search.' : 'No active staff members available.'}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="border-t pt-4 flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowManualSignUpDialog(false);
                        setSelectedStaffForSignUp([]);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      disabled={selectedStaffForSignUp.length === 0}
                      onClick={() => {
                        if (selectedStaffForSignUp.length > 0) {
                          onAdminSignUpStaff(selectedEvent.id, selectedStaffForSignUp);
                          setShowManualSignUpDialog(false);
                          setSelectedStaffForSignUp([]);
                        }
                      }}
                    >
                      Sign Up {selectedStaffForSignUp.length} Staff
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}