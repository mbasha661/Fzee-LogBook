// @vitest-environment jsdom
import React from 'react';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {ThemeProvider,ThemeSwitch,readTheme} from '../src/context/ThemeContext';
import {Brand} from '../src/components/Brand';
describe('appearance preferences',()=>{
 beforeEach(()=>{localStorage.clear();vi.stubGlobal('matchMedia',vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));});
 afterEach(()=>{cleanup();vi.unstubAllGlobals();});
 it('uses system by default and ignores unrecognized saved values',()=>{expect(readTheme()).toBe('system');localStorage.setItem('fzee-theme','invalid');expect(readTheme()).toBe('system');});
 it('switches themes and saves the choice',()=>{render(<ThemeProvider><ThemeSwitch/></ThemeProvider>);fireEvent.change(screen.getByLabelText('Appearance'),{target:{value:'dark'}});expect(document.documentElement.dataset.theme).toBe('dark');expect(localStorage.getItem('fzee-theme')).toBe('dark');fireEvent.change(screen.getByLabelText('Appearance'),{target:{value:'light'}});expect(document.documentElement.dataset.theme).toBe('light');});
 it('restores the saved preference on reopening',()=>{localStorage.setItem('fzee-theme','dark');render(<ThemeProvider><ThemeSwitch/></ThemeProvider>);expect((screen.getByLabelText('Appearance') as HTMLSelectElement).value).toBe('dark');expect(document.documentElement.style.colorScheme).toBe('dark');});
 it('follows the system dark preference',()=>{vi.stubGlobal('matchMedia',vi.fn(()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()})));render(<ThemeProvider><ThemeSwitch/></ThemeProvider>);expect(document.documentElement.dataset.theme).toBe('dark');});
 it('shows an accessible original logo',()=>{render(<Brand/>);expect(screen.getByAltText('FZEE feather and logbook mark').getAttribute('src')).toBe('/icon.svg');});
});
