import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { useStore } from './store/store';

beforeEach(() => {
  localStorage.clear();
  useStore.setState({
    cases: {},
    activeId: null,
    selectedId: null,
    history: { past: [], future: [] },
    report: null,
    asOf: null,
    tab: 'shares',
  });
});

describe('App', () => {
  it('opens the sample family and shows shares with their statutes', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Untangle heirs/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Explore a sample family' }));

    expect(screen.getByRole('heading', { name: 'Guided builder' })).toBeInTheDocument();
    const list = document.querySelector('.share-list') as HTMLElement;
    expect(within(list).getByText('Gloria Brooks')).toBeInTheDocument();
    fireEvent.click(within(list).getByText('Gloria Brooks'));
    expect(
      screen.getAllByText(/Last will and testament|Greene County Probate Court/).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('tab', { name: /Law/ }));
    expect(screen.getByText(/Georgia Revised Probate Code of 1998/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Documents/ }));
    expect(screen.getByText(/documents in hand/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Review/ }));
    expect(screen.getAllByText(/Calvin Freeman/).length).toBeGreaterThan(0);
  });

  it('answers guide questions', () => {
    useStore.getState().loadSample();
    render(<App />);
    expect(screen.getByText('3 questions left')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, established' }));
    expect(screen.getByText('2 questions left')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All children entered' }));
    fireEvent.click(screen.getByRole('button', { name: 'Living' }));
    expect(screen.getByText(/Every estate in the chain has been researched/)).toBeInTheDocument();
  });

  it('starts a new case from the welcome screen', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Start a new case' }));
    fireEvent.change(screen.getByLabelText(/Owner of record/), { target: { value: 'Ada Lee' } });
    fireEvent.change(screen.getByLabelText(/State where the land is/), { target: { value: 'NC' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create case' }));
    expect(screen.getByDisplayValue('Ada Lee property')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ada Lee' })).toBeInTheDocument();
  });

  it('prints the family chart report', () => {
    useStore.getState().loadSample();
    useStore.getState().setReport('chart');
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Family Chart and Heirship Determination' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Gloria Brooks').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Close report' }));
    expect(useStore.getState().report).toBeNull();
  });
});
