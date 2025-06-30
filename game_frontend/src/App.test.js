import { render, screen } from '@testing-library/react';
import App from './App';

test('renders game title and Start button', () => {
  render(<App />);
  const titleElement = screen.getByText(/FlagQuest/);
  expect(titleElement).toBeInTheDocument();
  // Accept both "Start Game" and "Start"
  const buttonElement =
    screen.getByText(/Start Game/) ||
    screen.getByText(/^Start$/) ||
    screen.getByRole("button", { name: /Start/i });
  expect(buttonElement).toBeInTheDocument();
});

