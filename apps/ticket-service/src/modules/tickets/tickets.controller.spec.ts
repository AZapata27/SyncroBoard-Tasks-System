import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@app/common';
import { TicketStatus, UserRole } from '@app/contracts';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

describe('TicketsController', () => {
  const ticketsService = {
    update: jest.fn(),
    delete: jest.fn(),
  };
  const controller = new TicketsController(ticketsService as unknown as TicketsService);

  beforeEach(() => jest.clearAllMocks());

  it('restricts ticket deletion to admins and project managers', () => {
    const roles = new Reflector().get<string[]>(ROLES_KEY, TicketsController.prototype.delete);

    expect(roles).toEqual([UserRole.ADMIN, UserRole.PROJECT_MANAGER]);
  });

  it('forwards updates together with the acting user id', async () => {
    ticketsService.update.mockResolvedValue({ id: 'ticket-1' });

    await controller.update('ticket-1', { status: TicketStatus.DONE }, 'user-9');

    expect(ticketsService.update).toHaveBeenCalledWith(
      'ticket-1',
      { status: TicketStatus.DONE },
      'user-9',
    );
  });

  it('returns a confirmation message after deleting', async () => {
    await expect(controller.delete('ticket-1')).resolves.toEqual({
      message: 'Ticket deleted successfully',
    });
    expect(ticketsService.delete).toHaveBeenCalledWith('ticket-1');
  });
});
