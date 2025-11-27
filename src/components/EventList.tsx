import { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock, Award, CheckCircle, Lock, Users, X, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Event, StaffMember } from '../App';
import { Level } from './AdminSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { formatDateWithDay } from '../utils/dateUtils';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';

interface EventListProps {
  events: Event[];
  levels: Level[];
  staffMembers: StaffMember[];
  onSignUp: (eventId: string) => void;
  onCancelSignUp?: (eventId: string) => void;
  currentLevel: string;
  isSignedUp: boolean;
  currentStaffId?: string;
}

export function EventList({ events, levels, staffMembers, onSignUp, onCancelSignUp, currentLevel, isSignedUp, currentStaffId }: EventListProps) {
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedLevelFilters, setSelectedLevelFilters] = useState<string[]>([]);

  // Update selectedEvent when the events prop changes
  useEffect(() => {
    if (selectedEvent) {
      const updatedEvent = events.find(e => e.id === selectedEvent.id);
      if (updatedEvent && updatedEvent !== selectedEvent) {
        setSelectedEvent(updatedEvent);
      }
    }
  }, [events]);

  // Sort levels by order (top is lowest, bottom is highest)
  const sortedLevels = levels ? [...levels].sort((a, b) => a.order - b.order) : [];

  // Get accessible levels for current user (their level and all levels above them)
  const currentLevelObj = sortedLevels.find(l => l.name === currentLevel);
  const accessibleLevels = currentLevelObj 
    ? sortedLevels.filter(l => l.order <= currentLevelObj.order)
    : [];

  // Apply level filter to events
  const filterEventsByLevel = (eventList: Event[]) => {
    if (selectedLevelFilters.length === 0) return eventList;
    return eventList.filter(e => selectedLevelFilters.includes(e.requiredLevel));
  };

  // Get today's date at midnight for consistent comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingEvents = filterEventsByLevel(
    events
      .filter(e => {
        // Parse event date as local to avoid timezone issues
        const [year, month, day] = e.date.split('-').map(Number);
        const eventDate = new Date(year, month - 1, day);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate >= today;
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  );

  const pastEvents = filterEventsByLevel(
    events
      .filter(e => {
        // Parse event date as local to avoid timezone issues
        const [year, month, day] = e.date.split('-').map(Number);
        const eventDate = new Date(year, month - 1, day);
        eventDate.setHours(0, 0, 0, 0);
        return eventDate < today;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  );

  const canAccessEvent = (event: Event) => {
    // Find the current user's level and the event's required level
    const currentLevelObj = sortedLevels.find(l => l.name === currentLevel);
    const requiredLevelObj = sortedLevels.find(l => l.name === event.requiredLevel);
    
    // Staff with no level cannot access any events
    if (!currentLevelObj) return false;
    
    // If event has invalid level, no access
    if (!requiredLevelObj) return false;
    
    // User can access events at their level or any level above them (lower order number)
    return requiredLevelObj.order <= currentLevelObj.order;
  };

  // Check if signup is allowed (must be at least 1 day before event)
  const canSignUpForEvent = (event: Event) => {
    const [year, month, day] = event.date.split('-').map(Number);
    const eventDate = new Date(year, month - 1, day);
    eventDate.setHours(0, 0, 0, 0); // Start of event day
    
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    // Allow signup only if today is before the event day
    return today < eventDate;
  };

  // Generate color for level badge based on level index
  const getLevelColor = (levelName: string) => {
    const levelIndex = sortedLevels.findIndex(l => l.name === levelName);
    const colors = [
      'bg-blue-50 text-blue-700 border-blue-300',
      'bg-purple-50 text-purple-700 border-purple-300',
      'bg-green-50 text-green-700 border-green-300',
      'bg-orange-50 text-orange-700 border-orange-300',
      'bg-pink-50 text-pink-700 border-pink-300',
    ];
    return colors[levelIndex % colors.length] || colors[0];
  };

  const renderEventCard = (event: Event, isPast: boolean = false) => {
    const hasAccess = canAccessEvent(event);
    const isEventSignedUp = event.signedUpStaff.length > 0;
    const isClosed = event.status === 'closed';
    
    // Check if current user signed up and their selection status
    const userSignedUp = currentStaffId && event.signedUpStaff.includes(currentStaffId);
    const userWasSelected = currentStaffId && event.confirmedStaff?.includes(currentStaffId);
    const showSelectionStatus = isClosed && userSignedUp;

    return (
      <Card 
        key={event.id} 
        className={`${isPast || isClosed ? 'opacity-60' : ''} cursor-pointer hover:shadow-lg transition-shadow`}
        onClick={() => {
          console.log('🖱️ Event clicked:', {
            eventId: event.id,
            eventName: event.name,
            status: event.status,
            confirmedStaff: event.confirmedStaff
          });
          setSelectedEvent(event);
        }}
      >
        <CardHeader>
          <CardTitle className="flex items-start justify-between">
            <span className="flex-1">{event.name}</span>
            <div className="flex gap-2">
              {isClosed && (
                <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                  Closed
                </Badge>
              )}
              <Badge variant="secondary">
                <Award className="h-3 w-3 mr-1" />
                {event.points} pts
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center text-gray-600">
            <Calendar className="h-4 w-4 mr-2" />
            {formatDateWithDay(event.date)}
          </div>
          
          <div className="flex items-center text-gray-600">
            <Clock className="h-4 w-4 mr-2" />
            {event.time} ({event.duration})
          </div>
          
          <div className="flex items-center text-gray-600">
            <MapPin className="h-4 w-4 mr-2" />
            {event.location}
          </div>
          
          <div className="pt-2 border-t flex items-center justify-between">
            <div>
              <Badge
                variant="outline"
                className={getLevelColor(event.requiredLevel)}
              >
                {event.requiredLevel || 'All Staff'}
              </Badge>
            </div>
            {isEventSignedUp && (
              <span className="text-gray-500">{event.signedUpStaff.length} signed up</span>
            )}
          </div>

          {/* Show selection status for closed events where user signed up */}
          {showSelectionStatus && (
            <div className="pt-2">
              {userWasSelected ? (
                <Badge className="w-full justify-center bg-green-50 text-green-700 border-green-300">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  You Were Selected
                </Badge>
              ) : (
                <Badge variant="outline" className="w-full justify-center bg-red-50 text-red-700 border-red-300">
                  <X className="h-3 w-3 mr-1" />
                  Not Selected
                </Badge>
              )}
            </div>
          )}

          {!isPast && !showSelectionStatus && (
            <div className="pt-2">
              {isClosed ? (
                <Button variant="outline" className="w-full" disabled>
                  Event Closed
                </Button>
              ) : isSignedUp ? (
                onCancelSignUp ? (
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCancelSignUp(event.id);
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel Attendance
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Signed Up
                  </Button>
                )
              ) : canSignUpForEvent(event) ? (
                hasAccess ? (
                  <Button
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSignUp(event.id);
                    }}
                  >
                    Sign Up for Event
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" disabled>
                    <Lock className="h-4 w-4 mr-2" />
                    Requires {event.requiredLevel}
                  </Button>
                )
              ) : (
                <Button variant="outline" className="w-full" disabled>
                  <Lock className="h-4 w-4 mr-2" />
                  {hasAccess ? 'Sign Up Closed' : `Requires ${event.requiredLevel}`}
                </Button>
              )}
            </div>
          )}
          
          {isPast && !showSelectionStatus && (
            <Badge variant="outline" className="w-full justify-center">
              Completed
            </Badge>
          )}
        </CardContent>
      </Card>
    );
  };

  // Get staff members who signed up for the selected event
  const getSignedUpStaffDetails = (event: Event | null) => {
    if (!event) return [];
    return event.signedUpStaff
      .map(staffId => staffMembers.find(s => s.id === staffId))
      .filter(Boolean) as StaffMember[];
  };

  const toggleLevelFilter = (levelName: string) => {
    setSelectedLevelFilters(prev => 
      prev.includes(levelName) 
        ? prev.filter(l => l !== levelName)
        : [...prev, levelName]
    );
  };

  const clearFilters = () => {
    setSelectedLevelFilters([]);
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Level Filter */}
      {accessibleLevels.length > 1 && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  <span className="text-gray-700">Filter by Level</span>
                </div>
                {selectedLevelFilters.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearFilters}
                  >
                    Clear All
                  </Button>
                )}
              </div>
              
              <div className="flex flex-wrap gap-4">
                {accessibleLevels.map((level) => (
                  <div key={level.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`level-${level.id}`}
                      checked={selectedLevelFilters.includes(level.name)}
                      onCheckedChange={() => toggleLevelFilter(level.name)}
                    />
                    <Label
                      htmlFor={`level-${level.id}`}
                      className="cursor-pointer"
                    >
                      <Badge 
                        variant="outline" 
                        className={getLevelColor(level.name)}
                      >
                        {level.name}
                      </Badge>
                    </Label>
                  </div>
                ))}
              </div>
              
              {selectedLevelFilters.length > 0 && (
                <p className="text-sm text-gray-500">
                  Showing events for {selectedLevelFilters.length} selected level{selectedLevelFilters.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {upcomingEvents.length === 0 && pastEvents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            {selectedLevelFilters.length > 0 
              ? 'No events match the selected filters. Try adjusting your filters.'
              : isSignedUp
                ? "You haven't signed up for any events yet. Check the Available tab to find events!"
                : 'No events available at the moment. Check back later!'}
          </CardContent>
        </Card>
      ) : (
        <>
          {upcomingEvents.length > 0 && (
            <div>
              <h3 className="text-gray-900 mb-4">
                {isSignedUp ? 'Upcoming Events' : 'Available Events'}
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                {upcomingEvents.map(event => renderEventCard(event))}
              </div>
            </div>
          )}

          {pastEvents.length > 0 && (
            <div>
              <h3 className="text-gray-900 mb-4">Past Events</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {pastEvents.map(event => renderEventCard(event, true))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Event Details Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{selectedEvent.name}</DialogTitle>
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
                    <Badge
                      variant="outline"
                      className={getLevelColor(selectedEvent.requiredLevel)}
                    >
                      Level: {selectedEvent.requiredLevel}
                    </Badge>
                  </div>

                  <div className="grid gap-3">
                    <div className="flex items-center text-gray-700">
                      <Calendar className="h-5 w-5 mr-3 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Date</p>
                        <p>{formatDateWithDay(selectedEvent.date)}</p>
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
                  </div>
                </div>

                {/* Signed Up Staff - Only show if event is not closed */}
                {selectedEvent.status !== 'closed' && (
                  <div className="border-t pt-4">
                    <div className="flex items-center mb-4">
                      <Users className="h-5 w-5 mr-2 text-gray-500" />
                      <h4 className="text-gray-900">
                        Signed Up Staff ({selectedEvent.signedUpStaff.length})
                      </h4>
                    </div>
                    
                    {getSignedUpStaffDetails(selectedEvent).length > 0 ? (
                      <div className="space-y-2">
                        {getSignedUpStaffDetails(selectedEvent).map((staff) => (
                          <div
                            key={staff.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-[#5D2972] text-white">
                                  {staff.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{staff.name}</p>
                                <p className="text-sm text-gray-500">{staff.email}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm text-gray-500">Level</p>
                              <Badge variant="outline" className="text-xs">
                                {staff.level || 'No Level'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">
                        No staff members signed up yet
                      </p>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                {new Date(selectedEvent.date) >= new Date() && (
                  <div className="border-t pt-4">
                    {selectedEvent.status === 'closed' ? (
                      <Button variant="outline" className="w-full" disabled>
                        Event Closed
                      </Button>
                    ) : isSignedUp ? (
                      onCancelSignUp ? (
                        <Button 
                          variant="destructive" 
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCancelSignUp(selectedEvent.id);
                            setSelectedEvent(null);
                          }}
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel Attendance
                        </Button>
                      ) : (
                        <Button variant="outline" className="w-full" disabled>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Already Signed Up
                        </Button>
                      )
                    ) : canSignUpForEvent(selectedEvent) ? (
                      canAccessEvent(selectedEvent) ? (
                        <Button
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSignUp(selectedEvent.id);
                            setSelectedEvent(null);
                          }}
                        >
                          Sign Up for Event
                        </Button>
                      ) : (
                        <Button variant="outline" className="w-full" disabled>
                          <Lock className="h-4 w-4 mr-2" />
                          Requires {selectedEvent.requiredLevel}
                        </Button>
                      )
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        <Lock className="h-4 w-4 mr-2" />
                        {canAccessEvent(selectedEvent) ? 'Sign Up Closed' : `Requires ${selectedEvent.requiredLevel}`}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}