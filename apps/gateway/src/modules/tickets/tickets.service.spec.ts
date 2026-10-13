import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { TicketPriority, TicketType } from '@app/contracts';
import { TicketsService } from './tickets.service';

const ok = <T>(data: T): AxiosResponse<T> =>
  ({
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  }) as AxiosResponse<T>;

describe('TicketsService (gateway proxy)', () => {
  let service: TicketsService;
  const httpService = { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    process.env.TICKET_SERVICE_URL = 'http://ticket-service:3002';
    const moduleRef = await Test.createTestingModule({
      providers: [TicketsService, { provide: HttpService, useValue: httpService }],
    }).compile();

    service = moduleRef.get(TicketsService);
  });

  it('forwards ticket creation to the ticket-service with the x-user-id header', async () => {
    httpService.post.mockReturnValue(of(ok({ id: 'ticket-1' })));
    const dto = {
      projectId: 'p-1',
      title: 'T',
      description: 'D',
      type: TicketType.TASK,
      priority: TicketPriority.LOW,
    };

    await expect(service.create(dto, 'user-1')).resolves.toEqual({ id: 'ticket-1' });
    expect(httpService.post).toHaveBeenCalledWith(
      'http://ticket-service:3002/api/v1/tickets',
      dto,
      { headers: { 'x-user-id': 'user-1' } },
    );
  });

  it('propagates the downstream status code (e.g. 404) to the client', async () => {
    const error = new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, undefined, {
      data: { message: 'Ticket with ID x not found', statusCode: 404 },
      status: 404,
      statusText: 'Not Found',
      headers: {},
      config: { headers: new AxiosHeaders() },
    });
    httpService.get.mockReturnValue(throwError(() => error));

    await expect(service.findOne('x')).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
    });
  });

  it('maps network failures to a 500 HttpException', async () => {
    httpService.get.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

    const promise = service.findAll({});

    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
  });
});
