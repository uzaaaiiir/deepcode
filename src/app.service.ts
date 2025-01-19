import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Breach } from './breach.entity';
import { Repository } from 'typeorm';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(Breach)
    private breachRepository: Repository<Breach>,
  ) {}

  findAll(): Promise<Breach[]> {
    return this.breachRepository.find();
  }

  findOne(id: number): Promise<Breach | null> {
    return this.breachRepository.findOne({ where: { id } });
  }

  async remove(id: string): Promise<void> {
    await this.breachRepository.delete(id);
  }
}
