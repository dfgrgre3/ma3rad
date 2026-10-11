import React from 'react';
import { Boxes } from 'lucide-react';

export const ProjectDetailPage: React.FC = () => (
  <div className='h-full flex flex-col items-center justify-center bg-slate-950 gap-4' dir='rtl'>
    <div className='w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center'>
      <Boxes className='w-8 h-8 text-violet-400' />
    </div>
    <div className='text-center'>
      <h1 className='text-lg font-black text-white mb-1'>ProjectDetailPage</h1>
      <p className='text-sm text-slate-400'>This page is under development.</p>
    </div>
    <div className='px-4 py-2 bg-sky-500/10 border border-sky-500/20 rounded-xl text-xs text-sky-400 font-semibold'>
      Under Development
    </div>
  </div>
);