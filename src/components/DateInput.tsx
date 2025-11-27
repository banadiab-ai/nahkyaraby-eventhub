import { Input } from './ui/input';
import { formatDateToDDMMYYYY, formatDateToYYYYMMDD, isValidDDMMYYYY } from '../utils/dateUtils';
import { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Calendar } from './ui/calendar';

interface DateInputProps {
  id?: string;
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void; // YYYY-MM-DD format
  required?: boolean;
  className?: string;
  placeholder?: string;
  minDate?: string; // YYYY-MM-DD format - minimum allowed date
}

export function DateInput({ id, value, onChange, required, className, placeholder = 'DD/MM/YYYY', minDate }: DateInputProps) {
  // Display value in DD/MM/YYYY format
  const [displayValue, setDisplayValue] = useState('');
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [open, setOpen] = useState(false);

  // Convert internal value (YYYY-MM-DD) to display format (DD/MM/YYYY)
  useEffect(() => {
    if (value) {
      setDisplayValue(formatDateToDDMMYYYY(value));
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    
    // Remove all non-numeric characters
    const numbersOnly = input.replace(/\D/g, '');
    
    // Auto-format with slashes
    let formatted = '';
    if (numbersOnly.length > 0) {
      // Add first 2 digits (day)
      formatted = numbersOnly.substring(0, 2);
      
      if (numbersOnly.length >= 3) {
        // Add slash and next 2 digits (month)
        formatted += '/' + numbersOnly.substring(2, 4);
      }
      
      if (numbersOnly.length >= 5) {
        // Add slash and remaining digits (year)
        formatted += '/' + numbersOnly.substring(4, 8);
      }
    }
    
    setDisplayValue(formatted);

    // Check if it's a complete date in DD/MM/YYYY format
    if (formatted.length === 10 && formatted.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      if (isValidDDMMYYYY(formatted)) {
        const [day, month, year] = formatted.split('/');
        const yearNum = parseInt(year, 10);
        
        // Validate year is not beyond 2099
        if (yearNum <= 2099) {
          const convertedDate = formatDateToYYYYMMDD(formatted);
          
          // Check if date is before minDate
          if (minDate && convertedDate < minDate) {
            setError(true);
            setErrorMessage('End Date cannot be before Start Date');
          } else {
            setError(false);
            setErrorMessage('');
            // Convert to YYYY-MM-DD for internal storage
            onChange(convertedDate);
          }
        } else {
          setError(true);
          setErrorMessage('Please enter a valid date in DD/MM/YYYY format (year must be between 1900 and 2099)');
        }
      } else {
        setError(true);
        setErrorMessage('Please enter a valid date in DD/MM/YYYY format (year must be between 1900 and 2099)');
      }
    } else if (formatted.length === 0) {
      setError(false);
      setErrorMessage('');
      onChange('');
    } else {
      // Clear error while typing
      setError(false);
      setErrorMessage('');
    }
  };

  const handleBlur = () => {
    // Validate on blur
    if (displayValue && displayValue.length > 0) {
      if (!isValidDDMMYYYY(displayValue)) {
        setError(true);
        setErrorMessage('Please enter a valid date in DD/MM/YYYY format (year must be between 1900 and 2099)');
      } else if (minDate) {
        const convertedDate = formatDateToYYYYMMDD(displayValue);
        if (convertedDate < minDate) {
          setError(true);
          setErrorMessage('End Date cannot be before Start Date');
        }
      }
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      // Convert Date to YYYY-MM-DD format
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      onChange(dateString);
      setError(false);
      setErrorMessage('');
      setOpen(false);
    }
  };

  // Convert YYYY-MM-DD to Date object for calendar
  const selectedDate = value ? new Date(value + 'T00:00:00') : undefined;
  const minDateObj = minDate ? new Date(minDate + 'T00:00:00') : undefined;

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input
          id={id}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          required={required}
          className={`flex-1 ${className} ${error ? 'border-red-500' : ''}`}
          maxLength={10}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
            >
              <CalendarIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleCalendarSelect}
              disabled={(date) => {
                if (minDateObj) {
                  return date < minDateObj;
                }
                return false;
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      </div>
      {error && errorMessage && (
        <p className="text-red-500 text-xs mt-1">
          {errorMessage}
        </p>
      )}
    </div>
  );
}