import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideAppConfigInitializer } from './config.initializer';
import { ConfigService } from './config.service';

describe('provideAppConfigInitializer', () => {
  it('registers an APP_INITIALIZER that calls ConfigService.load()', async () => {
    const load = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        provideAppConfigInitializer(),
        { provide: ConfigService, useValue: { load } },
      ],
    });

    // ApplicationInitStatus es el consumidor real de APP_INITIALIZER dentro
    // de Angular: su donePromise resuelve recién cuando todos los
    // initializers registrados (el nuestro incluido) terminaron.
    await TestBed.inject(ApplicationInitStatus).donePromise;

    expect(load).toHaveBeenCalledTimes(1);
  });
});
