import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

// This function tells Next.js that this route is dynamic and should not be statically optimized
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runScope = searchParams.get('run') || 'all';
  const zeroSource = searchParams.get('zero_source') || 'generated';
  const zeroCount = searchParams.get('zero_count');
  const dps = searchParams.get('dps');
  const resolution = searchParams.get('resolution');
  const xStart = searchParams.get('x_start');
  const xEnd = searchParams.get('x_end');
  const betaOffset = searchParams.get('beta_offset');
  const kPower = searchParams.get('k_power');

  const encoder = new TextEncoder();

  // Create a transform stream to handle the output
  const stream = new ReadableStream({
    start(controller) {
      const scriptPath = path.resolve(process.cwd(), '..', 'experiment_engine.py');
      const pythonCommand = 'python'; 
      
      const args = ['-u', scriptPath, '--run', runScope, '--zero-source', zeroSource];
      if (zeroCount) args.push('--zero-count', zeroCount);
      if (dps) args.push('--dps', dps);
      if (resolution) args.push('--resolution', resolution);
      if (xStart) args.push('--x-start', xStart);
      if (xEnd) args.push('--x-end', xEnd);
      if (betaOffset) args.push('--beta-offset', betaOffset);
      if (kPower) args.push('--k-power', kPower);

      console.log(`Spawning python process: ${pythonCommand} ${args.join(' ')}`);
      
      const pythonProcess = spawn(pythonCommand, args, {
        cwd: path.resolve(process.cwd(), '..'), // Run in the root folder
      });

      const send = (data: string) => {
        controller.enqueue(encoder.encode(data));
      };

      pythonProcess.stdout.on('data', (data) => {
        send(data.toString());
      });

      pythonProcess.stderr.on('data', (data) => {
        send(`[STDERR] ${data.toString()}`);
      });

      pythonProcess.on('close', (code) => {
        send(`\nProcess exited with code ${code}\n`);
        controller.close();
      });

      pythonProcess.on('error', (err) => {
        send(`\nFailed to start process: ${err.message}\n`);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
}
