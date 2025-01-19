import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Breach } from './breach.entity';
import { Repository } from 'typeorm';

import axios from 'axios';
import * as cheerio from 'cheerio';
import { resolve4 } from 'dns/promises';
import * as fs from 'fs';
import * as readline from 'readline';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(Breach)
    private breachRepository: Repository<Breach>,
  ) {}

  async parseAndEnrichFile(filePath: string): Promise<any> {
    // parse the file by lne and store in a list
    const data = [];
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      const tasks = [];
      rl.on('line', (line) => {
        tasks.push(this.processLine(line));
      });

      rl.on('close', async () => {
        await Promise.allSettled(tasks);
        console.log(`Processing completed in ${Date.now() - start}ms`);
        resolve(data);
      });

      // rl.on('line', async (line) => {
      //   // process each line
      //   const { username, password, url } =
      //     this.getUsernamePasswordAndUrl(line);

      //   console.log(`Processing ${url}`);

      //   try {
      //     const { domain, protocol, port, path } =
      //       await this.resolveUrlDetails(url);

      //     const { ipAddress, tags: dnsTags } =
      //       await this.resolveIpAddress(domain);

      //     const { status, title, tags: urlTags } = await this.verifyUrl(url);

      //     const html = status === 200 ? await this.fetchHtml(url) : null;

      //     const formTags = html
      //       ? await this.analyzeLoginForm(html)
      //       : { tags: [] };

      //     const allTags = [...dnsTags, ...urlTags, ...formTags.tags];

      //     // Create enriched record
      //     const breach = new Breach();
      //     breach.username = username;
      //     breach.password = password;
      //     breach.url = url;
      //     breach.domain = domain;
      //     breach.ipAddress = ipAddress;
      //     breach.tags = allTags;
      //     breach.status = status;
      //     breach.title = title;
      //     breach.port = +port || 0;
      //     breach.urlPath = path;
      //     breach.protocol = protocol;

      //     await this.breachRepository.save(breach);
      //     Logger.log(`Processed ${url}`);
      //     data.push(breach);
      //   } catch (error) {
      //     Logger.error(`Error processing ${url}`, error);
      //     console.error(`Error processing ${url}`, error);
      //   }
      // });

      // rl.on('close', () => {
      //   console.log(`Processing completed in ${Date.now() - start}ms`);
      //   resolve(data);
      // });

      rl.on('error', (err) => {
        reject(err);
      });
    });
  }

  async processLine(line: string): Promise<void> {
    const { username, password, url } = this.getUsernamePasswordAndUrl(line);
    if (!username || !password || !url) {
      Logger.warn(`Skipping malformed line: ${line}`);
      return;
    }

    try {
      const { domain, protocol, port, path } =
        await this.resolveUrlDetails(url);
      const { ipAddress, tags: dnsTags } = await this.resolveIpAddress(domain);
      const { status, title, tags: urlTags } = await this.verifyUrl(url);
      const html = status === 200 ? await this.fetchHtml(url) : null;
      const formTags = html ? await this.analyzeLoginForm(html) : { tags: [] };
      const allTags = [...dnsTags, ...urlTags, ...formTags.tags];

      const breach = new Breach();
      breach.username = username;
      breach.password = password;
      breach.url = url;
      breach.domain = domain;
      breach.ipAddress = ipAddress;
      breach.tags = allTags;
      breach.status = status;
      breach.title = title;
      breach.port = +port || 0;
      breach.urlPath = path;
      breach.protocol = protocol;

      await this.breachRepository.save(breach);
      Logger.log(`Processed ${url}`);
    } catch (error) {
      Logger.error(`Error processing ${url}: ${error.message}`);
    }
  }

  getUsernamePasswordAndUrl(data: string): {
    username: string;
    password: string;
    url: string;
  } {
    const parts = data.split(':');
    if (parts.length < 3) {
      return { username: '', password: '', url: data };
    }

    const url = parts.slice(0, parts.length - 2).join(':');
    const username = parts[parts.length - 2];
    const password = parts[parts.length - 1];

    return { username, password, url };
  }

  async resolveUrlDetails(url: string) {
    try {
      const urlObject = new URL(url);
      const domain = urlObject.hostname;
      const protocol = urlObject.protocol;
      const path = urlObject.pathname;
      const port = urlObject.port || '80';

      return { domain, protocol, path, port };
    } catch (error) {
      console.error('Error parsing url', error.message);
      return { domain: '', protocol: '', path: '', port: '' };
    }
  }

  // async resolveIpAddress(domain: string) {
  //   try {
  //     const addresses = await resolve4(domain);
  //     return { ipAddress: addresses[0], tags: [] };
  //   } catch (error) {
  //     console.error('Error resolving domain:', error.message);
  //     return { ipAddress: '0.0.0.0', tags: ['unresolved'] };
  //   }
  // }

  async resolveIpAddress(domain: string) {
    try {
      const addresses = await resolve4(domain);
      return { ipAddress: addresses[0], tags: [] };
    } catch (error) {
      Logger.warn(`DNS resolution failed for ${domain}, trying root domain`);
      const rootDomain = domain.split('.').slice(-2).join('.');
      try {
        const addresses = await resolve4(rootDomain);
        return { ipAddress: addresses[0], tags: ['root-domain-fallback'] };
      } catch {
        console.error('Error resolving domain:', error.message);
        return { ipAddress: '0.0.0.0', tags: ['unresolved'] };
      }
    }
  }

  async verifyUrl(url: string) {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      const $ = cheerio.load(response.data);
      const title = $('title').text();
      return {
        status: response.status,
        title,
        tags: [],
      };
    } catch (error) {
      return { status: 0, title: '', tags: ['inaccessible'] };
    }
  }

  async analyzeLoginForm(html: string): Promise<{ tags: string[] }> {
    const tags = [];
    if (html.includes('<input type="password"')) {
      tags.push('login-form');
    }

    if (html.includes('CAPTCHA')) {
      tags.push('captcha-required');
    }

    if (html.includes('2FA')) {
      tags.push('2fa-required');
    }

    return { tags };
  }

  async fetchHtml(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, { timeout: 10000 });
      return response.data;
    } catch (error) {
      console.error('Error fetching html:', error.message);
      return null;
    }
  }
}
