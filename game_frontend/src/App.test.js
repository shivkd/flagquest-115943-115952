import { render, screen } from '@testing-library/react';
import App from './App';

test('renders game title and Start button', () => {
  render(<App />);
  const titleElement = screen.getByText(/FlagQuest/);
  expect(titleElement).toBeInTheDocument();
  const buttonElement = screen.getByText(/Start Game/);
  expect(buttonElement).toBeInTheDocument();
});

