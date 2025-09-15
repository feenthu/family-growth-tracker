
import React from 'react';
import { Person } from '../types';

interface AvatarProps {
  person: Person;
  size?: 'xs' | 'sm' | 'base';
}

export const Avatar: React.FC<AvatarProps> = ({ person, size = 'base' }) => {
  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const sizeClasses = {
    xs: 'w-5 h-5 text-xs',
    sm: 'w-8 h-8 text-sm',
    base: 'w-10 h-10 text-base',
  };

  return (
    <div
      className={`flex items-center justify-center rounded-full text-white font-bold ${person.color} ${sizeClasses[size]}`}
      title={person.name}
    >
      {getInitials(person.name)}
    </div>
  );
};
