import {
  BarChart as RBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart as RLineChart, Line, PieChart as RPieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#0F2B4A', '#C9920A', '#166534', '#0F766E', '#6D28D9', '#991B1B'];

export function BarChart({ data, xKey, bars, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DDE1E7" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fontFamily: 'DM Sans' }} />
        <YAxis tick={{ fontSize: 12, fontFamily: 'DM Sans' }} />
        <Tooltip contentStyle={{ fontFamily: 'DM Sans', fontSize: 13, borderRadius: 8, border: '1px solid #DDE1E7' }} />
        {bars.map((b, i) => <Bar key={b.key} dataKey={b.key} name={b.label || b.key} fill={b.color || COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
      </RBarChart>
    </ResponsiveContainer>
  );
}

export function LineChart({ data, xKey, lines, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#DDE1E7" />
        <XAxis dataKey={xKey} tick={{ fontSize: 12, fontFamily: 'DM Sans' }} />
        <YAxis tick={{ fontSize: 12, fontFamily: 'DM Sans' }} />
        <Tooltip contentStyle={{ fontFamily: 'DM Sans', fontSize: 13, borderRadius: 8, border: '1px solid #DDE1E7' }} />
        {lines.map((l, i) => <Line key={l.key} type="monotone" dataKey={l.key} name={l.label || l.key} stroke={l.color || COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
      </RLineChart>
    </ResponsiveContainer>
  );
}

export function PieChart({ data, height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RPieChart>
        <Pie data={data} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} />)}
        </Pie>
        <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontFamily: 'DM Sans', fontSize: 12 }} />
        <Tooltip contentStyle={{ fontFamily: 'DM Sans', fontSize: 13, borderRadius: 8, border: '1px solid #DDE1E7' }} />
      </RPieChart>
    </ResponsiveContainer>
  );
}
